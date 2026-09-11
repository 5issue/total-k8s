#!/usr/bin/env bash

# Never allow a caller's shell tracing option to expose certificate material.
set +x
set -euo pipefail

readonly SOURCE_NAMESPACE="messaging"
readonly TARGET_SECRET="rabbitmq-ca"
readonly TARGET_NAMESPACES=("messaging" "backend")

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <kubectl-context> [source-secret ...]" >&2
  exit 2
fi

readonly KUBECTL_CONTEXT="$1"
readonly KUBECTL=(kubectl --context "${KUBECTL_CONTEXT}")
shift

if [[ -z "${KUBECTL_CONTEXT}" ]]; then
  echo "kubectl context must not be empty" >&2
  exit 2
fi

if [[ $# -eq 0 ]]; then
  readonly SOURCE_SECRETS=("rabbitmq-ca-signing")
else
  readonly SOURCE_SECRETS=("$@")
fi

for source_secret in "${SOURCE_SECRETS[@]}"; do
  if [[ ${#source_secret} -gt 253 || ! "${source_secret}" =~ ^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$ ]]; then
    echo "Invalid source Secret name: ${source_secret}" >&2
    exit 2
  fi
done

for command_name in kubectl base64 openssl tr; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command not found: ${command_name}" >&2
    exit 1
  fi
done

"${KUBECTL[@]}" get namespace "${SOURCE_NAMESPACE}" >/dev/null
for namespace in "${TARGET_NAMESPACES[@]}"; do
  "${KUBECTL[@]}" get namespace "${namespace}" >/dev/null
done

# kubectl emits only each selected public certificate field to the parent shell.
# The operator still requires Secret read RBAC because Kubernetes has no key-level RBAC.
ca_pem=""
for source_secret in "${SOURCE_SECRETS[@]}"; do
  source_base64="$(
    "${KUBECTL[@]}" \
      --namespace "${SOURCE_NAMESPACE}" \
      get secret "${source_secret}" \
      --output 'jsonpath={.data.tls\.crt}'
  )"

  if [[ -z "${source_base64}" ]]; then
    echo "${SOURCE_NAMESPACE}/${source_secret} has no tls.crt" >&2
    exit 1
  fi

  source_pem="$(printf '%s' "${source_base64}" | base64 --decode)"

  if ! printf '%s\n' "${source_pem}" | openssl x509 -noout -checkend 0 >/dev/null; then
    echo "${SOURCE_NAMESPACE}/${source_secret} tls.crt is not currently valid" >&2
    exit 1
  fi

  ca_basic_constraints="$(printf '%s\n' "${source_pem}" | openssl x509 -noout -ext basicConstraints)"
  if [[ "${ca_basic_constraints}" != *"CA:TRUE"* ]]; then
    echo "${SOURCE_NAMESPACE}/${source_secret} tls.crt is not a CA certificate" >&2
    exit 1
  fi

  ca_pem+="${source_pem}"$'\n'
done

readonly ca_pem
readonly ca_base64="$(printf '%s' "${ca_pem}" | base64 | tr -d '\n')"

publish_target() {
  local namespace="$1"

  if "${KUBECTL[@]}" --namespace "${namespace}" get secret "${TARGET_SECRET}" >/dev/null 2>&1; then
    printf '[{"op":"add","path":"/data","value":{"ca.crt":"%s"}}]' "${ca_base64}" |
      "${KUBECTL[@]}" \
        --namespace "${namespace}" \
        patch secret "${TARGET_SECRET}" \
        --type json \
        --patch-file /dev/stdin >/dev/null
  else
    printf '%s\n' "${ca_pem}" |
      "${KUBECTL[@]}" \
        --namespace "${namespace}" \
        create secret generic "${TARGET_SECRET}" \
        --from-file=ca.crt=/dev/stdin >/dev/null
  fi

  local target_keys
  target_keys="$(
    "${KUBECTL[@]}" \
      --namespace "${namespace}" \
      get secret "${TARGET_SECRET}" \
      --output 'go-template={{range $key, $_ := .data}}{{$key}}{{"\n"}}{{end}}'
  )"

  if [[ "${target_keys}" != "ca.crt" ]]; then
    echo "Unexpected data keys in ${namespace}/${TARGET_SECRET}" >&2
    exit 1
  fi

  local published_base64
  published_base64="$(
    "${KUBECTL[@]}" \
      --namespace "${namespace}" \
      get secret "${TARGET_SECRET}" \
      --output 'jsonpath={.data.ca\.crt}'
  )"

  if [[ "${published_base64}" != "${ca_base64}" ]]; then
    echo "Published certificate mismatch in ${namespace}/${TARGET_SECRET}" >&2
    exit 1
  fi

  echo "Published ${namespace}/${TARGET_SECRET} with ca.crt only"
}

for namespace in "${TARGET_NAMESPACES[@]}"; do
  publish_target "${namespace}"
done
