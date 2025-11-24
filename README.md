# Overview

**xyOps Satellite (xySat)** is a companion to the [xyOps](https://xyops.io) workflow automation and server monitoring platform.  It is both a job runner, and a data collector for server monitoring and alerting.  xySat is designed to be installed on *all* of your servers, so it is lean and mean, and has zero dependencies.

# Installation

See the [xySat Installation Guide](https://github.com/pixlcore/xyops/blob/main/docs/hosting.md#satellite) for details.

# Configuration

See the [xySat Configuration Guide](https://github.com/pixlcore/xyops/blob/main/docs/config.md#satellite) for details.

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
