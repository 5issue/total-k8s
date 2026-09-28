FROM percona/percona-server:8.0.41-32.1

USER root

RUN rm -rf /etc/my.cnf /etc/my.cnf.d \
    && ln -s /usr /usr/local/mysql \
    && test -f /usr/lib64/mysql/plugin/audit_log.so \
    && for c in sleep tail mysqld mysqladmin mysql mysql_tzinfo_to_sql; do command -v "$c" || exit 1; done

ENV PERCONA_TELEMETRY_DISABLE=1

ENTRYPOINT ["mysqld"]
EXPOSE 3306 33060 33062 8080
USER 10000:10000
