# Overview

**xyOps Satellite (xySat)** is a companion to the [xyOps](https://xyops.io) workflow automation and server monitoring platform.  It is both a job runner, and a data collector for server monitoring and alerting.  xySat is designed to be installed on *all* of your servers, so it is lean and mean, and has zero dependencies.

# Installation

See the [xySat Installation Guide](https://docs.xyops.io/hosting/satellite) for details.

## Manual Installation

If you would like to install xySat manually (for e.g. to run it as a non-root user), see below for the steps.

### Linux

<details><summary>Manual Linux Installation</summary>

First, click "Add Server" button in the sidebar in the xyOps UI.  Select "Linux" as the target platform, and copy the one-line installer command.  It will look something like this:

```sh
curl -s "http://YOUR_XYOPS_SERVER:5522/api/app/satellite/install?t=AUTH_TOKEN" | sudo sh
```

We're not going to run this command as is, but we need the URL.  So copy the full URL, and create two new URLs by swapping out the word "install" like this:

- **Download Tarball:** `http://YOUR_XYOPS_SERVER:5522/api/app/satellite/core?t=AUTH_TOKEN&os=linux&arch=YOUR_ARCH`
- **Download Config:** `http://YOUR_XYOPS_SERVER:5522/api/app/satellite/config?t=AUTH_TOKEN`

Make sure you copy over the auth token *exactly* as it is shown.  In the tarball URL replace `YOUR_ARCH` with either `x64` or `arm64`, depending on your server's architecture.

Now, SSH to the Linux server you want to install xySat on.  Note that it needs to be installed in `/opt/xyops/satellite/` for everything to work correctly.  So you may need to become root to create this directory, but you can then `chown` it to another user before installing.  It is possible to run xySat in a different directory, but it is not recommended.

Here are the commands to get it installed and configured:

```sh
# create base directory and cd into it
mkdir -p /opt/xyops/satellite
cd /opt/xyops/satellite

# download tarball and extract
curl -fsSL "http://YOUR_XYOPS_SERVER:5522/api/app/satellite/core?t=AUTH_TOKEN&os=linux&arch=YOUR_ARCH" | tar zxf -

# Fetch custom config file for satellite
curl -fsSL "http://YOUR_XYOPS_SERVER:5522/api/app/satellite/config?t=AUTH_TOKEN" > config.json
chmod 600 config.json

# Set some permissions
chmod 775 *.sh bin/*

# Start it up (forks a background daemon)
./control.sh start
```

Notably, this installation method will not register xySat as a systemd service, so it is up to you to configure it to auto-start on boot if you want.

</details>

### macOS

<details><summary>Manual macOS Installation</summary>

First, click "Add Server" button in the sidebar in the xyOps UI.  Select "macOS" as the target platform, and copy the one-line installer command.  It will look something like this:

```sh
curl -s "http://YOUR_XYOPS_SERVER:5522/api/app/satellite/install?t=AUTH_TOKEN&os=macos" | sudo sh
```

We're not going to run this command as is, but we need the URL.  So copy the full URL, and create two new URLs by swapping out the word "install" like this:

- **Download Tarball:** `http://YOUR_XYOPS_SERVER:5522/api/app/satellite/core?t=AUTH_TOKEN&os=macos&arch=YOUR_ARCH`
- **Download Config:** `http://YOUR_XYOPS_SERVER:5522/api/app/satellite/config?t=AUTH_TOKEN`

Make sure you copy over the auth token *exactly* as it is shown.  In the tarball URL replace `YOUR_ARCH` with either `x64` (Intel) or `arm64` (Apple Silicon), depending on your Mac's architecture.

Now, open Terminal.app on the macOS machine you want to install xySat on.  Note that it needs to be installed in the `/opt/xyops/satellite/` directory for everything to work correctly.  So you may need to become root to create this directory, but you can then `chown` it to another user before installing.  It is possible to run xySat in a different directory, but it is not recommended.

Here are the commands to get it installed and configured:

```sh
# create base directory and cd into it
mkdir -p /opt/xyops/satellite
cd /opt/xyops/satellite

# download tarball and extract
curl -fsSL "http://YOUR_XYOPS_SERVER:5522/api/app/satellite/core?t=AUTH_TOKEN&os=macos&arch=YOUR_ARCH" | tar zxf -

# Fetch custom config file for satellite
curl -fsSL "http://YOUR_XYOPS_SERVER:5522/api/app/satellite/config?t=AUTH_TOKEN" > config.json
chmod 600 config.json

# Set some permissions
chmod 775 *.sh bin/*

# Start it up (forks a background daemon)
./control.sh start
```

Notably, this installation method will not register xySat as a [LaunchAgent/LaunchDaemon](https://developer.apple.com/library/content/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html), so it is up to you to configure it to auto-start on boot if you want.

</details>

### Windows

<details><summary>Manual Windows Installation</summary>

First, click "Add Server" button in the sidebar in the xyOps UI.  Select "Windows" as the target platform, and copy the one-line installer command.  It will look something like this:

```sh
powershell -Command "IEX (Invoke-WebRequest -UseBasicParsing -Uri 'http://YOUR_XYOPS_SERVER:5522/api/app/satellite/install?t=AUTH_TOKEN&os=windows').Content"
```

We're not going to run this command as is, but we need the URL.  So copy the full URL, and then create two new URLs by swapping out the word "install" like this:

- **Download Tarball:** `http://YOUR_XYOPS_SERVER:5522/api/app/satellite/core?t=AUTH_TOKEN&os=windows&arch=x64`
- **Download Config:** `http://YOUR_XYOPS_SERVER:5522/api/app/satellite/config?t=AUTH_TOKEN`

Make sure you copy over the auth token *exactly* as it is shown.  Note that only Windows on x64 is supported at this time.  Final steps:

1. Create a new folder for xySat to live in on the target Windows machine.
2. Download and decompress the tarball into the new folder.
3. Download the config file and save it in the new folder.  It should be named `config.json`.
4. Start the process as shown below:

Open a command prompt and type these commands:

```
cd C:\PATH\TO\NEW\XYSAT\FOLDER
bin\node.exe main.js --echo --foreground
```

Notably, this installation method will not register xySat as a Windows service, so it is up to you to configure it to auto-start on boot if you want.  Also, you'll need to keep the terminal window open to keep it running (minimized is fine).

</details>

# Configuration

See the [xySat Configuration Guide](https://docs.xyops.io/config/satellite) for details.

# Development

You can install the source code by using [Git](https://en.wikipedia.org/wiki/Git) ([Node.js](https://nodejs.org/) is also required):

```sh
git clone https://github.com/pixlcore/xysat.git
cd xysat
npm install
```

You can then run it in debug mode by issuing this command:

```sh
node --trace-warnings main.js --debug --debug_level 9 --echo
```

# License

See [LICENSE.md](LICENSE.md) in this repository.

## Included Software

This software includes the Node.js runtime engine, which is licensed separately:

https://github.com/nodejs/node/blob/main/LICENSE
