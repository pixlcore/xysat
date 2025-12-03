FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
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
	python3 \
	git \
	ca-certificates \
	gnupg

# install docker cli
RUN . /etc/os-release; \
  install -m 0755 -d /etc/apt/keyrings; \
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc; \
  chmod a+r /etc/apt/keyrings/docker.asc; \
  ARCH=$(dpkg --print-architecture); \
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/$ID ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list; \
  apt-get update && apt-get install -y --no-install-recommends docker-ce-cli;

# cleanup apt
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

WORKDIR /opt/xyops/satellite
COPY . .

ENV NODE_ENV=production

ENV SATELLITE_foreground=true
ENV SATELLITE_echo=true
ENV SATELLITE_debug_level=5

RUN npm install

CMD ["sh", "start.sh"]
