FROM node:22-bullseye

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
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
	docker-ce-cli

RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
RUN mv /root/.local/bin/uv /usr/bin/uv
RUN mv /root/.local/bin/uvx /usr/bin/uvx

WORKDIR /opt/xyops/satellite
COPY . .

ENV NODE_ENV=production

ENV SATELLITE_foreground=true
ENV SATELLITE_echo=true
ENV SATELLITE_debug_level=5

RUN npm install

CMD ["node", "/opt/xyops/satellite/main.js", "start"]
