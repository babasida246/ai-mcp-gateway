# Dockerfile to build Postgres with pgvector extension
FROM postgres:15

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    ca-certificates \
    postgresql-server-dev-15 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp

# Build and install pgvector extension from source
RUN git clone https://github.com/pgvector/pgvector.git \
    && cd pgvector \
    && make \
    && make install \
    && cd / \
    && rm -rf /tmp/pgvector

WORKDIR /var/lib/postgresql

EXPOSE 5432
FROM postgres:15

# Install build dependencies to compile pgvector
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    ca-certificates \
    clang \
    pkg-config \
    wget \
    ca-certificates \
    postgresql-server-dev-15 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN git clone --depth 1 https://github.com/pgvector/pgvector.git \
    && cd pgvector \
    && make && make install \
    && cd /tmp && rm -rf pgvector

# Clean up
RUN apt-get purge -y --auto-remove git build-essential pkg-config clang \
    && rm -rf /var/lib/apt/lists/* /tmp/*

# Keep default entrypoint/cmd from postgres base image
