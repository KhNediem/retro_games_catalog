FROM mysql:8.0

# Copy initialization script
COPY retro_games.sql /docker-entrypoint-initdb.d/

# Set MySQL configuration
COPY my.cnf /etc/mysql/conf.d/

# Expose port
EXPOSE 3306
