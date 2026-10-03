FROM node:24-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/pixlcore/xysat"
LABEL org.opencontainers.image.description="Remote satellite worker daemon for xyOps."
LABEL org.opencontainers.image.licenses="BSD-3-Clause"

ENV DEBIAN_FRONTEND=noninteractive

# Install system packages and the Docker CLI together so apt caches are
# removed before this layer is saved.
RUN set -eu; \
	apt-get update; \
	apt-get install -y --no-install-recommends \
	zip unzip xz-utils bzip2 procps lsof \
	iputils-ping \
	dnsutils \
	openssh-client \
	net-tools \
	curl \
	wget \
	vim \
	less \
	sudo \
	iproute2 \
	tzdata \
	build-essential \
	python3 \
	python3-distutils \
	python3-setuptools \
	pkg-config \
	libc6-dev \
	libssl-dev \
	zlib1g-dev \
	libffi-dev \
	git \
	ca-certificates \
	gnupg; \
	. /etc/os-release; \
	install -m 0755 -d /etc/apt/keyrings; \
	curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc; \
	chmod a+r /etc/apt/keyrings/docker.asc; \
	ARCH=$(dpkg --print-architecture); \
	echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] \
	https://download.docker.com/linux/$ID ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
	> /etc/apt/sources.list.d/docker.list; \
	apt-get update; \
	apt-get install -y --no-install-recommends docker-ce-cli; \
	apt-get clean; \
	rm -rf /var/lib/apt/lists/*

# Install and move uv in one layer to avoid retaining the original binaries.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
	&& mv /root/.local/bin/uv /usr/local/bin/uv \
	&& mv /root/.local/bin/uvx /usr/local/bin/uvx

WORKDIR /opt/xyops/satellite
COPY . .

ENV NODE_ENV=production

ENV SATELLITE_foreground=true
ENV SATELLITE_echo=true
ENV SATELLITE_debug_level=5

# Install dependencies and clear the npm cache before this layer is saved.
RUN npm install && npm cache clean --force

CMD ["bash", "container-start.sh"]
