# xySat Changelog

## Version v0.9.68

> January 14, 2026

- [`dffcfd3`](https://github.com/pixlcore/xysat/commit/dffcfd379e9a229e6e422d6be67879e0e8f61e9f): Version 0.9.68
- [`0817a61`](https://github.com/pixlcore/xysat/commit/0817a61731efe2b387f4e8f8431679ed6d2706fb): Upgrade Satellite: Remove "__daemon" environment variable, used by pixl-server.
- [`226b9c4`](https://github.com/pixlcore/xysat/commit/226b9c49277207d1b8b7545078a7c2313f9c6797): Startup Log File Check: Include hostname in notice/critical messages sent to conductor.

## Version v0.9.67

> January 14, 2026

- [`9e4fa37`](https://github.com/pixlcore/xysat/commit/9e4fa37353f3f1c24790e5db54758877d490c40d): Version 0.9.67
- [`5692f8f`](https://github.com/pixlcore/xysat/commit/5692f8fe7f0de2d5cfa0172233dea4e1d72dff60): Comm: Sanity check on socket in handleSocketMessage (race condition on shutdown)

## Version v0.9.66

> January 14, 2026

- [`c2c2fc0`](https://github.com/pixlcore/xysat/commit/c2c2fc0a3adfb3b68fd2031b1f8eac23e1022371): Version 0.9.66
- [`763a73a`](https://github.com/pixlcore/xysat/commit/763a73a016b8b9410729cce54d987304f51ae70d): Crasher Fix: Sending incorrect websocket data format for notice/critical messages.

## Version v0.9.65

> January 13, 2026

- [`0270765`](https://github.com/pixlcore/xysat/commit/0270765a12533c968ced2be98ca3d6924379eb81): Version 0.9.65
- [`518f9d7`](https://github.com/pixlcore/xysat/commit/518f9d7088f4df893f965efd726498d43d1dc7c1): New upgrade logic: Use background.log, check for stale log, etc.
- [`e535c33`](https://github.com/pixlcore/xysat/commit/e535c33ba3eebc8e2ae7587ded540fbd21d5c23e): On socket auth, check for background.log and crash.log.  If found, send notices/criticals to the primary conductor.

## Version v0.9.64

> January 10, 2026

- [`d139bc1`](https://github.com/pixlcore/xysat/commit/d139bc175471ef19e54600e28d712f21414db63f): Version 0.9.64
- [`4600d07`](https://github.com/pixlcore/xysat/commit/4600d07cc584f885bd1b1d981427e2634b032ca4): Fix: Export PATH in container-start.sh, so it properly propagates out

## Version v0.9.63

> January 10, 2026

- [`4dccb60`](https://github.com/pixlcore/xysat/commit/4dccb60fabde4f539380abb4e084e74e5ab2cbc1): Version 0.9.63
- [`e99bd7e`](https://github.com/pixlcore/xysat/commit/e99bd7e3b413c1232b515a2d14d41991e0197173): Add common PATH locations to container-start.sh

## Version v0.9.62

> January 10, 2026

- [`87a4a1c`](https://github.com/pixlcore/xysat/commit/87a4a1c1cc596c4803c1f10af6ec29c21875a1ef): Version 0.9.62
- [`80e0c29`](https://github.com/pixlcore/xysat/commit/80e0c29ef76a8ac736b3f29e8d5a96203d5de0b6): Fix: Move uv/uvx binaries to a standard PATH location

## Version v0.9.61

> January 10, 2026

- [`3b3c23a`](https://github.com/pixlcore/xysat/commit/3b3c23a0f1d18a82d547c2dfe6c70e7c5d18d458): Version 0.9.61
- [`3e360b6`](https://github.com/pixlcore/xysat/commit/3e360b6611d034096bb622026353fbb611cbb9c4): Refactor: Changes in monitor plugins and new features.
- [`6b021b6`](https://github.com/pixlcore/xysat/commit/6b021b6b67e513e7b611b8f0c23ece3e179cf1a5): Add new "features" object, which reports satellite features on connect
- [`ef38f37`](https://github.com/pixlcore/xysat/commit/ef38f37f9d9b24f6b42f7ca9a5d75ba50d32eee7): Drop default ping timeout from 120 to 60 seconds, and add support for new testMonitorPlugin command.
- [`7678659`](https://github.com/pixlcore/xysat/commit/7678659ca5ea52d73d0b2dc3276ae62019fed06e): Test Plugin: Add support for simulated "Abort" style response.
- [`bed1a7f`](https://github.com/pixlcore/xysat/commit/bed1a7faaf97be36451f7f23372da58075473284): HTTP Plugin: Report details in markdown format, and set idleTimeout to value of timeout.

## Version v0.9.60

> January 8, 2026

- [`824e6ea`](https://github.com/pixlcore/xysat/commit/824e6ea844d3a2dc2de7050b452d2946f0d28d43): Version 0.9.60
- [`dfefa9f`](https://github.com/pixlcore/xysat/commit/dfefa9fd44e21a3b2f3bda01dddfa7afe30065ed): Fix: Properly handle shutdown while jobs are still running.

## Version v0.9.59

> January 8, 2026

- [`8deef75`](https://github.com/pixlcore/xysat/commit/8deef75017305fec975844be07eeeb45d8657c00): Version 0.9.59
- [`75a6adc`](https://github.com/pixlcore/xysat/commit/75a6adc4794e8525957ec8109bb4e98a31d9564d): Fix: Crasher bug in detectVirtualization with public cloud VMs
- [`c393066`](https://github.com/pixlcore/xysat/commit/c393066a240bd9f542fe9a48877621c95cd6e7e5): Fix: Crasher bug on macOS when netstat doesn't return any interfaces.
- [`95a6d3f`](https://github.com/pixlcore/xysat/commit/95a6d3f8d03188817cd9759e9071469609202b3a): Changelog Script: Add smarts, tweak formatting.

## Version v0.9.58

> January 5, 2026

- [`4f00f79`](https://github.com/pixlcore/xysat/commit/4f00f79127e662aa9ff7b2decd77b396dfeb72cc): Version 0.9.58
- [`63d470e`](https://github.com/pixlcore/xysat/commit/63d470e9994c15cf28366f16e8d8c40e5c4b60d5): Add container sanity check in container-start.sh
- [`f3c8287`](https://github.com/pixlcore/xysat/commit/f3c82874bebff28e25ae8b2d5d5de86ee1e5d13a): If files failed to upload during job finish, clear out files array
- [`e54a0bb`](https://github.com/pixlcore/xysat/commit/e54a0bb4e64b742dc0abfbdff3449887c3bbb65e): Rename start.sh to container-start.sh (only for use as a docker container entrypoint)

## Version v0.9.57

> December 31, 2025

- [`3743d35`](https://github.com/pixlcore/xysat/commit/3743d35fa6f0ccb1aea37b0f318e80bb1585dc57): Version 0.9.57
- [`0fa6ab5`](https://github.com/pixlcore/xysat/commit/0fa6ab5094a358602af81d79ab6a78a229545de7): Add changelog generator script, and changelog itself.
- [`a23c985`](https://github.com/pixlcore/xysat/commit/a23c9854fe25fba29c5b3de66cd48b79d8ba3fdf): Add package-lock

## Version v0.9.56

> December 30, 2025

- [`9fa719a`](https://github.com/pixlcore/xysat/commit/9fa719ad271a3e19907c7f7d4ca656ea545fe497): Version 0.9.56
- [`d874422`](https://github.com/pixlcore/xysat/commit/d8744228bf59c6d975478c553b193dd8516ac943): Only add non-object params to ENV vars (i.e. skip JSON ones)
- [`e335bb2`](https://github.com/pixlcore/xysat/commit/e335bb2fbdbd4919a015f0a38a69ca4622d1c2e3): Test Plugin: Log incoming job params.

## Version v0.9.55

> December 29, 2025

- [`2101471`](https://github.com/pixlcore/xysat/commit/2101471f677dc4bc7e76944027e35ed6d8093092): Version 0.9.55

## Version v0.9.54

> December 24, 2025

- [`fa9bcd6`](https://github.com/pixlcore/xysat/commit/fa9bcd6080693ccf2e9da79271facd60709e68dd): Version 0.9.54
- [`f1d006c`](https://github.com/pixlcore/xysat/commit/f1d006c7b0a3be2102a29e293445d1637f730f3c): Multiple changes...
- [`38ac10d`](https://github.com/pixlcore/xysat/commit/38ac10d5926bbf73c620e0cdf567235fee1673a7): Remove pid check in main.js -- happens already in pixl-server

## Version v0.9.53

> December 16, 2025

- [`41efd6d`](https://github.com/pixlcore/xysat/commit/41efd6d6c480fc2e07abee5b4f0df73650f98196): Version 0.9.53
- [`6b147c9`](https://github.com/pixlcore/xysat/commit/6b147c9d011e07a4dd48088d281e85b9a8a0a661): Retire macos 13, move to 14...

## Version v0.9.52

> December 16, 2025

- [`97a45ba`](https://github.com/pixlcore/xysat/commit/97a45ba4d33eb125b33b10ca51215e021e5f93e6): Version 0.9.52
- [`95e6192`](https://github.com/pixlcore/xysat/commit/95e6192746950235a3e26155fcb8827fe36d81f0): Protection against event plugin printing the entire job object to STDOUT
- [`bacf4ee`](https://github.com/pixlcore/xysat/commit/bacf4ee15fe75968f06f922ab227e32633b0dd65): Remove debugging info
- [`083f518`](https://github.com/pixlcore/xysat/commit/083f5184c71ad2177519e44051ff1e0fc37d03c5): Remove unused "monitoring_only" flag

## Version v0.9.51

> December 6, 2025

- [`1bdb290`](https://github.com/pixlcore/xysat/commit/1bdb290b49b79e583484b4edf5789823913b166b): Version 0.9.51
- [`6dd4777`](https://github.com/pixlcore/xysat/commit/6dd477708cadbb59b30797acac81f770b523f6f6): Use exec to replace start.sh script process with node process
- [`430c2da`](https://github.com/pixlcore/xysat/commit/430c2daf9fa8a2431f09c044548d79671270e767): Startup config validation and debug logging (auth vs key methods)
- [`f0318fe`](https://github.com/pixlcore/xysat/commit/f0318feb28f5aea2076186e2529b0622676dbc06): Add level-9 debug logging for auth server negotiation
- [`696481d`](https://github.com/pixlcore/xysat/commit/696481dc70baae585853e7f70d5420cc44597492): Echo custom param in output data

## Version v0.9.50

> December 5, 2025

- [`8c1db57`](https://github.com/pixlcore/xysat/commit/8c1db573d88c110674eeb2cc835f9c0ebe323360): Version 0.9.50
- [`470e84e`](https://github.com/pixlcore/xysat/commit/470e84e08dd422d616f1ccd0cc2d700ca190efbb): Add protection against rare race condition, which could crash if socket was closed during the quickmon host delay.

## Version v0.9.49

> December 3, 2025

- [`d807722`](https://github.com/pixlcore/xysat/commit/d80772296f7d72a7997258046383390fab6e9d99): Version 0.9.49
- [`ed7b383`](https://github.com/pixlcore/xysat/commit/ed7b38358dc4d76366801855015ac39717640c2e): Always report job completion on process exit (copy shell plugin behavior)
- [`164f781`](https://github.com/pixlcore/xysat/commit/164f7811473675238edd3dc9612716037b9f1196): Fix issue with secrets getting clobbered by runner meta

## Version v0.9.48

> December 3, 2025

- [`c986f93`](https://github.com/pixlcore/xysat/commit/c986f93243fdbd65f0e3ff47e14bd3d6e524e18b): Version 0.9.48

## Version v0.9.47

> December 2, 2025

- [`3c99af0`](https://github.com/pixlcore/xysat/commit/3c99af010c681f7dc16488837cec75f90a6cf333): Version 0.9.47
- [`f49e276`](https://github.com/pixlcore/xysat/commit/f49e2767e078a8e928899fb89d6f750e2577fe6d): Trying node:22-bookworm-slim again, also added labels

## Version v0.9.46

> December 2, 2025

- [`56914c7`](https://github.com/pixlcore/xysat/commit/56914c7d22f60bdd7e1d86b051e9b330ef600f2b): Version 0.9.46
- [`3751491`](https://github.com/pixlcore/xysat/commit/37514910cfc6819ae3263e79ea82c7c16e5eb7fc): Switch to node:22-bookworm, so we can build native addons (node-gyp, etc.)

## Version v0.9.45

> December 2, 2025

- [`19fdfdc`](https://github.com/pixlcore/xysat/commit/19fdfdc061246932ba4ac4fa141baaa62822986c): Version 0.9.45
- [`e03f111`](https://github.com/pixlcore/xysat/commit/e03f1111422b91bc05ad5acffbbc8ec26ea4a58e): Move to node:22-bookworm-slim
- [`158efa9`](https://github.com/pixlcore/xysat/commit/158efa9d2ba8f11c7f37a02af3da9c222bf45cfc): Pass secrets in job metadata as well as env vars
- [`8505d89`](https://github.com/pixlcore/xysat/commit/8505d895418e71dfcec900e6e7a1f1fb724a75f7): Add new docker plugin

## Version v0.0.44

> November 30, 2025

- [`bd4961f`](https://github.com/pixlcore/xysat/commit/bd4961f15f1025fb19838d54e5f5b2ff28c62cd6): Version 0.0.44
- [`04df82a`](https://github.com/pixlcore/xysat/commit/04df82a6f6827d397b7bb03a2303ca233ffd1554): Add support for remote jobs via a runner script (e.g. xyRun)
- [`379d9b9`](https://github.com/pixlcore/xysat/commit/379d9b9d24deae093d7fff84523719c1783929a0): Cleanup pid file from last run (i.e. from container hard restart)

## Version v0.0.43

> November 24, 2025

- [`c160844`](https://github.com/pixlcore/xysat/commit/c160844653478f3014f5ae4165b42bc89125411d): Version 0.0.43
- [`4be2c8b`](https://github.com/pixlcore/xysat/commit/4be2c8b1c44086948a032c837792fde6b530a18b): Fix doc links
- [`6811986`](https://github.com/pixlcore/xysat/commit/6811986838bd784db256c9a51c3dd1e14ff9fe88): Remove old secret_key default prop (not needed)
- [`556b5d8`](https://github.com/pixlcore/xysat/commit/556b5d82cfe2bce8cf0919bd4ff21444dfd32600): New start script with support for bootstrap config

## Version v0.0.42

> November 22, 2025

- [`edef85f`](https://github.com/pixlcore/xysat/commit/edef85fc9088172b5fbd680456ea2f3495906dd1): Version 0.0.42
- [`024cfe7`](https://github.com/pixlcore/xysat/commit/024cfe70924e8d74d413c18b59519106fc870243): Include command secrets in env, if any were provided
- [`92c9799`](https://github.com/pixlcore/xysat/commit/92c97999d4a5d268fe76921302d5a528d50fa375): Multiple changes...
- [`ef6ccd6`](https://github.com/pixlcore/xysat/commit/ef6ccd6f565fddc766ab19fd64eabe62394c382f): Add updateConfig WS command
- [`c3332c1`](https://github.com/pixlcore/xysat/commit/c3332c129b96d79e095e723411e1861e794f1c73): Re-lic to BSD-3

## Version v0.0.41

> October 24, 2025

- [`9fd2e91`](https://github.com/pixlcore/xysat/commit/9fd2e916f2e1c8105a5e40bdc6dd3f5773f30eb2): Version 0.0.41
- [`5d7510e`](https://github.com/pixlcore/xysat/commit/5d7510e63757e313551661c6f364ef4522b095d2): Support new "details" object sent alongside job.
- [`669eb7c`](https://github.com/pixlcore/xysat/commit/669eb7ce460f6185622cbe1f71f91a4360af44c8): Update LICENSE formatting so it (hopefully) triggers GitHub's auto-license detection

## Version v0.0.40

> October 23, 2025

- [`3e132f6`](https://github.com/pixlcore/xysat/commit/3e132f66926a56524047234deab54c57234b8d34): Version 0.0.40
- [`af91a45`](https://github.com/pixlcore/xysat/commit/af91a45af99640f9e485705a5ee04f58d6211924): Standardize on xy:1
- [`3ac5e2a`](https://github.com/pixlcore/xysat/commit/3ac5e2a3831b366e42279b9879ed959ffdeae330): Standardize on xy:1, also fix bug with error handling
- [`d9707bc`](https://github.com/pixlcore/xysat/commit/d9707bc56c12f231e2d8ed8a79454f72e26b177b): Standardize on STDIO API with xy and type props, sent into child

## Version v0.0.39

> October 11, 2025

- [`9adbd42`](https://github.com/pixlcore/xysat/commit/9adbd42efc5864d53880d002571932fecea4867b): Version 0.0.39
- [`75a2c83`](https://github.com/pixlcore/xysat/commit/75a2c831a8a2c844719863ab269eec1e598aea75): Still trying to get Docker CLI to install...

## Version v0.0.38

> October 11, 2025

- [`94ca6ba`](https://github.com/pixlcore/xysat/commit/94ca6ba3d5381438abbca9621734867094f88403): Version 0.0.38
- [`81f862c`](https://github.com/pixlcore/xysat/commit/81f862c174d9858a9c235ff3f7ff996ebcbda477): Typo

## Version v0.0.37

> October 11, 2025

- [`8bbceb9`](https://github.com/pixlcore/xysat/commit/8bbceb9dd8d73012b48c878b397983c2dacee371): Version 0.0.37
- [`bd22f4a`](https://github.com/pixlcore/xysat/commit/bd22f4a0d2ccd1f041dc3163fd18a435da064c42): Another attempt at getting docker CLI to install

## Version v0.0.36

> October 11, 2025

- [`4f25c15`](https://github.com/pixlcore/xysat/commit/4f25c15c33eb74e25d495c4d0d2db94750f8547c): Version 0.0.36
- [`703745f`](https://github.com/pixlcore/xysat/commit/703745fdc73694886e564723ddfee80e4e34add7): add some custom PATHs and set sane defaults (on linux/macos)
- [`f06c848`](https://github.com/pixlcore/xysat/commit/f06c8486458fbaa5c127e53db4e1707853fdb0d3): Multiple changes...
- [`b122d49`](https://github.com/pixlcore/xysat/commit/b122d49df84a8062018f780fb3c7281363cc5cb8): Add git and docker CLI

## Version v0.0.35

> October 7, 2025

- [`5995aa3`](https://github.com/pixlcore/xysat/commit/5995aa3b5a51c8e4c69958a8945ba16d2e9a739f): Version 0.0.35
- [`d36be08`](https://github.com/pixlcore/xysat/commit/d36be0825e9967515ee87c6744a6eae8b91b8f03): Fix issue where child emitting random (non-xy) JSON isn't echoed in output

## Version v0.0.34

> October 7, 2025

- [`21f9b41`](https://github.com/pixlcore/xysat/commit/21f9b41ef284b430bdddfb47e7eba10aee5345eb): Version 0.0.34
- [`596ea34`](https://github.com/pixlcore/xysat/commit/596ea340cf2efdc1b54cf3dd8c4a2390684f400a): Add section on included software (node.js)

## Version v0.0.33

> October 7, 2025

- [`08f3abf`](https://github.com/pixlcore/xysat/commit/08f3abf1becfed686a7cb8e548f53d92ab2928f4): Version 0.0.33
- [`9b14888`](https://github.com/pixlcore/xysat/commit/9b148887bf8ab14a27f0fa1e85b5b6b862b13613): Support new "host" param / env var to override hosts
- [`67a0ab9`](https://github.com/pixlcore/xysat/commit/67a0ab9563bb7864defd5af5b300cfacb0910e9c): Use perf.metrics() instead of the old summarize()
- [`d2feb2e`](https://github.com/pixlcore/xysat/commit/d2feb2e527ec1f0fa3d46b02fdcf3a5dc82f6a27): Rename legacy mode to cronicle mode

## Version v0.0.32

> September 12, 2025

- [`e2a4bae`](https://github.com/pixlcore/xysat/commit/e2a4bae3eefca6ee8d4ad899e7be4866c3317a86): Version 0.0.32
- [`45bc4f9`](https://github.com/pixlcore/xysat/commit/45bc4f9a0feb24ffb49ff6819fb3801650c9658c): Change job kill (abort policy) to string: none, parent, or all.

## Version v0.0.31

> September 11, 2025

- [`dddc3c5`](https://github.com/pixlcore/xysat/commit/dddc3c570abfa41e230e692eca0d94ee82fbc301): Version 0.0.31
- [`b40c7c1`](https://github.com/pixlcore/xysat/commit/b40c7c13e98f6fd96259288c037c8f7f06d09c54): Implement kill all children option (job.kill)
- [`1c247c3`](https://github.com/pixlcore/xysat/commit/1c247c30d7a47128864235377534c25abf3cc4cf): Implement cleanEnv

## Version v0.0.30

> September 6, 2025

- [`0872af9`](https://github.com/pixlcore/xysat/commit/0872af99df749898ba752cf277e09bc907ca0371): Version 0.0.30
- [`9d2ebaa`](https://github.com/pixlcore/xysat/commit/9d2ebaa45ad8f8e3406322ebc57b4bd4148e7652): Change startup msg log level back to 2 (race condition with windows)
- [`a41dd49`](https://github.com/pixlcore/xysat/commit/a41dd49ad8809a2c1402a499294484a3614452dd): Log startup message to windows event logger

## Version v0.0.29

> September 5, 2025

- [`47f924c`](https://github.com/pixlcore/xysat/commit/47f924c956f426d90ed6dd8da6dcbe2bda34c982): Version 0.0.29
- [`605eab0`](https://github.com/pixlcore/xysat/commit/605eab084e665c8fe5916e048711f77570e5cc57): Fix json stream parse on win
- [`20c9ac3`](https://github.com/pixlcore/xysat/commit/20c9ac3fc2d76c72a4b1cea3a05a6cd283be0004): Fix json stream parser on windows
- [`13e5ad8`](https://github.com/pixlcore/xysat/commit/13e5ad8cbb416dc1fcc3006ce25a1bf27ad0b5a8): Fix memRss and memVsz on windows
- [`53cc77a`](https://github.com/pixlcore/xysat/commit/53cc77ac0063c7ded4500ae4764ce85d5c06f59c): Better support for Windows line endings
- [`d2f4282`](https://github.com/pixlcore/xysat/commit/d2f42829337a57d33390973229bc74aecec475e9): Log startup and shutdown at level 1
- [`8fda581`](https://github.com/pixlcore/xysat/commit/8fda581060c8859445765196a4c72ce4da2af76e): Log ws connect at level 1

## Version v0.0.28

> September 5, 2025

- [`fb120e1`](https://github.com/pixlcore/xysat/commit/fb120e16897b60643e663a0def0fa3b94c9fc53a): Version 0.0.28
- [`05b001d`](https://github.com/pixlcore/xysat/commit/05b001d00f49b92d90310cf816ee13624e0274f4): Initial support for win32 (WIP)
- [`c66aeee`](https://github.com/pixlcore/xysat/commit/c66aeeef7b4ba62e4c7f1e6d38d547bbab567e0e): upgradeSatellite: Lots of changes for WIndows (OMG)

## Version v0.0.27

> September 5, 2025

- [`be064c5`](https://github.com/pixlcore/xysat/commit/be064c504dd0e4576c47ff0107f2aec49d9e4c68): Version 0.0.27
- [`c1473ee`](https://github.com/pixlcore/xysat/commit/c1473ee1cecbfc2a3a54d2cad19818ee1f368d50): Allow self-upgrades in foreground mode (docker)
- [`bae922f`](https://github.com/pixlcore/xysat/commit/bae922f5a7498be5118490a876f3289fb001c773): Start: early check for PID file, to prevent stompping on ourselves

## Version v0.0.26

> September 4, 2025

- [`6132b8a`](https://github.com/pixlcore/xysat/commit/6132b8a97c50f29f2f6d08f388e6fb987d19be46): Version 0.0.26
- [`cbf4903`](https://github.com/pixlcore/xysat/commit/cbf49034607678993dea265babf59fd00683999f): Multiple changes...
- [`394825b`](https://github.com/pixlcore/xysat/commit/394825b3dae5317f1bb24fe44bba4001550a3d50): Do not include uid or gid features for windows
- [`d5ac1c7`](https://github.com/pixlcore/xysat/commit/d5ac1c78cb5ff875bae2f2eaefd04e51c2b59a8d): Fix class name (Engine to Satellite)
- [`50caf4e`](https://github.com/pixlcore/xysat/commit/50caf4eb64107b41afb04b932b6f7bceb64f7e38): Multiple changes...

## Version v0.0.25

> September 3, 2025

- [`551d331`](https://github.com/pixlcore/xysat/commit/551d331fb32c990d26b7310abbf416d908c85b8e): Version 0.0.25
- [`9c567ea`](https://github.com/pixlcore/xysat/commit/9c567ea05dbe02c500eaf304926a94f024e587a9): Cleaner shutdown sequence

## Version v0.0.24

> September 2, 2025

- [`6f42f42`](https://github.com/pixlcore/xysat/commit/6f42f428452e21dc7771e6a4fc22c6a4acc18420): Version 0.0.24
- [`0c126e7`](https://github.com/pixlcore/xysat/commit/0c126e73c50d72fc6de1c5bf35f48e36ce23d4ef): Log errors to dedicated error log
- [`a3cc172`](https://github.com/pixlcore/xysat/commit/a3cc1729024fc81fa8423871ce7fbbcd66911836): Split logs into component logs, and move some utility functions to utils.js
- [`cb85184`](https://github.com/pixlcore/xysat/commit/cb85184984750cf55f3ea54e98d48ce3c035b65e): Split single log into component logs
- [`7871c83`](https://github.com/pixlcore/xysat/commit/7871c83c46e2b78bae66f162c73983c2bfc3322c): Check for upgradeRequest on jobFinish, call upgradeSatellite if pending
- [`0d84ac5`](https://github.com/pixlcore/xysat/commit/0d84ac51e2839a0cb199ed72b24015d60256520a): Copy debug and foreground from server, add curlBin and wgetBin on Linux/macOS
- [`be51ccc`](https://github.com/pixlcore/xysat/commit/be51ccc45f8a282957148df75e76e755bb1958da): Add support for self upgrades
- [`c19c2cb`](https://github.com/pixlcore/xysat/commit/c19c2cb0a361d81e8ed3b6e5f99c5442716822ee): Support for stopping service on windows via stop command
- [`e195441`](https://github.com/pixlcore/xysat/commit/e195441ae45d4cb302736a0fb31758690439d948): Buffer job log output (pipeline)

## Version v0.0.23

> August 30, 2025

- [`84a3ddc`](https://github.com/pixlcore/xysat/commit/84a3ddc52d82d185d4aee5044522eaf41a20d4a0): Version 0.0.23
- [`d551843`](https://github.com/pixlcore/xysat/commit/d55184366886a1113c9aaa6d259a1fa066d2897e): Fix uv/uvx install steps

## Version v0.0.22

> August 30, 2025

- [`319d5c5`](https://github.com/pixlcore/xysat/commit/319d5c522eedf37dec69f96ff95757a4dc87f637): Update README.
- [`844fd95`](https://github.com/pixlcore/xysat/commit/844fd95759b69d041a9fd5ca17ae4ca64805a6a4): Version 0.0.22
- [`38ace17`](https://github.com/pixlcore/xysat/commit/38ace1737044c3d055705c483b1fdbc0a4e6ab68): Support airgap mode
- [`4488cc2`](https://github.com/pixlcore/xysat/commit/4488cc2388e85c88f417f9add3bf0a3579b34182): Support for config updates on master connect, and airgap mode, relic to MIT
- [`14d0d5e`](https://github.com/pixlcore/xysat/commit/14d0d5eaf8576497afeb2ed9dd502079672d2795): Relicense to MIT
- [`1fc9982`](https://github.com/pixlcore/xysat/commit/1fc998299b13d674905c1a3a1324943e7d2a3da8): New Docker workflow
- [`3035ba0`](https://github.com/pixlcore/xysat/commit/3035ba037f520029ffbf84b1f0849febc0a6c029): Add info.process.pid
- [`8a003c5`](https://github.com/pixlcore/xysat/commit/8a003c5df1da2d7e2768af84281e1815a8fda1fa): Support for secrets
- [`c479249`](https://github.com/pixlcore/xysat/commit/c47924924614019df03aea0b639d3e20ee2697f7): Change boot name to "xysat" for easier use with systemd / systemctl

## Version v0.0.21

> August 8, 2025

- [`8e309f1`](https://github.com/pixlcore/xysat/commit/8e309f141fb3ca7aa83daf116762108e109d09ac): Version 0.0.21
- [`a238635`](https://github.com/pixlcore/xysat/commit/a2386357d79c95ad8338af7373f54c21eee2b35a): Rename to xyOps / xySat
- [`cddaf98`](https://github.com/pixlcore/xysat/commit/cddaf98a276057bb61944de8bf9db8b8d30ce7fb): Remove extra params, always spawn sleep proc and report progress, tweak sample data

## Version v0.0.20

> July 26, 2025

- [`970447b`](https://github.com/pixlcore/xysat/commit/970447b67ccf0df88fa664d3048a0da061cfcced): Version 0.0.20
- [`988ddf6`](https://github.com/pixlcore/xysat/commit/988ddf61f7aea8014637d9584a2809829fbcf97f): Big rename to opsrocket-satellite

## Version v0.0.19

> July 25, 2025

- [`b674239`](https://github.com/pixlcore/xysat/commit/b674239dedb2ee09b7dfa9919447666260c8cc51): Version 0.0.19
- [`986c542`](https://github.com/pixlcore/xysat/commit/986c542edee13e05920606bbe1215eaa3e80ef99): A bunch of changes...
- [`a793574`](https://github.com/pixlcore/xysat/commit/a793574936bf998b8251fd84dd65346f2e6ff438): Tweak dirs for new job.cwd overhaul
- [`11b8204`](https://github.com/pixlcore/xysat/commit/11b8204f914ad903d2ac50a941c0de4e2b4a3894): Now downloading to job cwd, and use Path.join for windows
- [`3aa4c93`](https://github.com/pixlcore/xysat/commit/3aa4c93b950ec2c33d85870b5e633756f4deefff): Typo fixes
- [`d8e5b30`](https://github.com/pixlcore/xysat/commit/d8e5b30afa7b3b6b703c62ac67204f7f5935bf6e): chdir fixes for new job temp dir layout
- [`34b0517`](https://github.com/pixlcore/xysat/commit/34b0517392bded7432e15d73453078a06ac28521): Create job temp dir parent on startup
- [`8b845d6`](https://github.com/pixlcore/xysat/commit/8b845d6c0e8a0054d2532bea754f0f073cc288cd): Call prepLaunchJob
- [`46f7ba4`](https://github.com/pixlcore/xysat/commit/46f7ba43d2a1d8092b15f0e39d86e414c6d36b5a): A number of changes...
- [`141b2d9`](https://github.com/pixlcore/xysat/commit/141b2d9687a90b52e1abe05b31293b08118ceaeb): Fix API URL for uploading job log (needs port now)

## Version v0.0.18

> May 31, 2025

- [`76b0982`](https://github.com/pixlcore/xysat/commit/76b09826d6e41e740226f3374cb2e65c1fbd5fc5): Version 0.0.18
- [`b62a734`](https://github.com/pixlcore/xysat/commit/b62a734e6379650fc67e446b60bd1e512bdf2eff): Typo fix, and timing delay tweak...
- [`b689fa9`](https://github.com/pixlcore/xysat/commit/b689fa99fb06fa33a2f30a55090e100a57111ed7): allow `masters` config param to override hosts, and split string if needed
- [`1e3a62c`](https://github.com/pixlcore/xysat/commit/1e3a62c50e1107aea811989cadefa403ceec5d7c): Port now stored separately from host array
- [`c5a7811`](https://github.com/pixlcore/xysat/commit/c5a7811e1f84242d77e65f5985a34c3db49d5617): Multiple changes...
- [`6a96167`](https://github.com/pixlcore/xysat/commit/6a96167e224e50cc550dc4c513e03d4430877162): Create sample config on startup if does not exist.

## Version v0.0.17

> May 30, 2025

- [`bf8e1b3`](https://github.com/pixlcore/xysat/commit/bf8e1b39d9f3e66ce08ee0b03011f44fb06bb7d9): Version 0.0.17
- [`8b5c9ce`](https://github.com/pixlcore/xysat/commit/8b5c9ce5243a44aa9f814282dc47a8f3b8bf92d6): New dynamic max sleep system for both monitors and quickmon
- [`72d956a`](https://github.com/pixlcore/xysat/commit/72d956a4a991934d1a1c71531913acfac5694385): Multiple changes...
- [`f713803`](https://github.com/pixlcore/xysat/commit/f713803eae96e67c27e9a4d42458a5f78f60eb7c): Handle "retry" ws response
- [`f3a73ae`](https://github.com/pixlcore/xysat/commit/f3a73aee28183a1db75545f8a38b76b0a24829e7): Add support for ORCHESTRA_masters env vars
- [`c9033e1`](https://github.com/pixlcore/xysat/commit/c9033e168157e4644d4070c00952038c28e7a745): Filter out our own ps spawn from proc list
- [`bfb21e7`](https://github.com/pixlcore/xysat/commit/bfb21e7d99fba4dcb8a6fc6fc88ec664b0c0565b): Change default socker_reconnect_delay_max to 30s
- [`7b8ba73`](https://github.com/pixlcore/xysat/commit/7b8ba736498c9952c90f5b1d0b9913b881adba8b): Drop node to version 18

## Version v0.0.16

> April 6, 2025

- [`5ed35a2`](https://github.com/pixlcore/xysat/commit/5ed35a2d0d8d85b05bb9f60fc01fefc39b845c12): Version 0.0.16
- [`3e6cc0f`](https://github.com/pixlcore/xysat/commit/3e6cc0f732ceb3952a0d2eb5c6e84ac87e60c630): Add node-notifier dep
- [`d90d0c0`](https://github.com/pixlcore/xysat/commit/d90d0c06c210cf1d8f950f6b6caf7a9e243fdc3e): Improve plugin exec args
- [`f804eb2`](https://github.com/pixlcore/xysat/commit/f804eb27ea8cc6f03847a119251c88d041784122): Add new ws uninstall conductor command
- [`7928d87`](https://github.com/pixlcore/xysat/commit/7928d87cb9cd775074dd9c0bb4b509408fc78133): Install script changes...
- [`a9d74c1`](https://github.com/pixlcore/xysat/commit/a9d74c184bf04af571d8bbef8b81a120bf340d68): Misc cleanup to win32 service stuff
- [`3a7bedd`](https://github.com/pixlcore/xysat/commit/3a7bedd8588bbf16c18a1879e6c6659b4a3f45dd): Improve error messages
- [`d94c64f`](https://github.com/pixlcore/xysat/commit/d94c64f088bba7422ab75ed8566980cd5bb7c774): Fully implement uninstall command (deletes everything!)
- [`5e6cec0`](https://github.com/pixlcore/xysat/commit/5e6cec0e71296c3f1af749b4efd2a8e3ec47de54): Naming (conductor)
- [`84e31c4`](https://github.com/pixlcore/xysat/commit/84e31c4cb257f1abacaea0ea24724aa72f5400cd): Code cleanup
- [`bbbd545`](https://github.com/pixlcore/xysat/commit/bbbd54524b849ad1daa5627c2cc3fb620cf7e18f): Exponential backoff retry on socket reconnects
- [`000f1f2`](https://github.com/pixlcore/xysat/commit/000f1f2f90663a326825b4d4d3a8e7ce2d30510f): Daily log archive
- [`962ec90`](https://github.com/pixlcore/xysat/commit/962ec90a01be4d51ba122af1536875240cd96b74): Support for windows shell scripts.
- [`6361f07`](https://github.com/pixlcore/xysat/commit/6361f0744640b4bfb60151a03156578f00da79b6): Multiple...
- [`92b9930`](https://github.com/pixlcore/xysat/commit/92b9930a8cbeba8d916552fafd993e2b662a06b0): Multiple...
- [`8d7a71a`](https://github.com/pixlcore/xysat/commit/8d7a71a3a7e868620afff84261a2e9be51e5ff80): Multiple...
- [`60553b8`](https://github.com/pixlcore/xysat/commit/60553b85163daf3e4e33f17bac3a43bc468fead1): Init procCache, and only check psBin on Linux/macOS
- [`6464311`](https://github.com/pixlcore/xysat/commit/646431156534f105697dc6af28e0ff2d2620e410): Leave package.json file as it contains our version
- [`616b0b0`](https://github.com/pixlcore/xysat/commit/616b0b07a916b659a68d348cfee2e4acd9ef9024): Read version from package.json file
- [`293e065`](https://github.com/pixlcore/xysat/commit/293e065dc6714dacb816aee62f7091be42f14efb): Added clause for included software

## Version v0.0.15

> March 23, 2025

- [`97b2322`](https://github.com/pixlcore/xysat/commit/97b232245d4c27b7d6dd19a0e5b8cfcac8648fab): Version 0.0.15

## Version v0.0.14

> March 22, 2025

- [`37ac8c1`](https://github.com/pixlcore/xysat/commit/37ac8c1f2b4bd1bab144633f0162aac3edbc14e1): v0.0.14
- [`d644bd4`](https://github.com/pixlcore/xysat/commit/d644bd47aaa448e3fc577fec89578c7bcf32141a): Support for auth token style handshake with orchestra conductor

## Version v0.0.13

> March 22, 2025

- [`e9c51da`](https://github.com/pixlcore/xysat/commit/e9c51da81cccf7710d925896db63edbccd1e6764): Version 0.0.13
- [`0555ad3`](https://github.com/pixlcore/xysat/commit/0555ad3e95b41b6d9a4002cbad1e1f2d2849cd7c): More misc file cleanup
- [`628e290`](https://github.com/pixlcore/xysat/commit/628e290d5acf1fcdda2d07a4be122ee5c5494ef0): More file cleanup
- [`340824c`](https://github.com/pixlcore/xysat/commit/340824c1244d1f2cee2148803fb7bfbd421a8353): Change plugin loading location.
- [`09cc0a5`](https://github.com/pixlcore/xysat/commit/09cc0a5c4f5c9ce5a80077f85417f039d4c10240): Rename bin/ to plugins/

## Version v0.0.12

> March 22, 2025

- [`8ecc7e3`](https://github.com/pixlcore/xysat/commit/8ecc7e3e7973b50e075caf323e04a1fcfa6410fd): Version 0.0.12
- [`d5aadf7`](https://github.com/pixlcore/xysat/commit/d5aadf7b0dc4b8b808424670fcf73f261f97c775): New windows install handler
- [`83ca88f`](https://github.com/pixlcore/xysat/commit/83ca88f0f9b6cf8600b0fcdaf4ed40cd682233c5): Trying new strat for windows
- [`52d5d9d`](https://github.com/pixlcore/xysat/commit/52d5d9d7c8e42739f20c98156164cb4bc39a8c61): New windows bat files

## Version v0.0.11

> March 19, 2025

- [`9c5b377`](https://github.com/pixlcore/xysat/commit/9c5b377b1b41d9e455516f4e7e998ad3d13a39a3): Trying proper OS names for x64/arm builds.

## Version v0.0.10

> March 19, 2025

- [`39167af`](https://github.com/pixlcore/xysat/commit/39167af91b9455fbcdf5b98be3d2b97f07734197): Trying to use newfangled arch in GH actions

## Version v0.0.9

> March 19, 2025

- [`6e83479`](https://github.com/pixlcore/xysat/commit/6e83479bd3555b5186b599598e8ee4960fcc0c5a): Trying harder to make GitHub happy.

## Version v0.0.8

> March 19, 2025

- [`5b96c48`](https://github.com/pixlcore/xysat/commit/5b96c48badd5992c8fdbc7f70f261032d90d6510): Trying to make GH happy on the release step...

## Version v0.0.7

> March 19, 2025

- [`bca8526`](https://github.com/pixlcore/xysat/commit/bca85263aab38f0cb6a590691510b127d4979e0e): Trying more things to make Windows happy.

## Version v0.0.6

> March 19, 2025

- [`8470551`](https://github.com/pixlcore/xysat/commit/847055121c47b40e2a16d98909f63026ed2dcb86): Trying an alt way of tarring up the dir.

## Version v0.0.5

> March 19, 2025

- [`41101be`](https://github.com/pixlcore/xysat/commit/41101befc83525cadaf447a8f7bc69d286d64a57): Sigh, trying more things.

## Version v0.0.4

> March 19, 2025

- [`950136c`](https://github.com/pixlcore/xysat/commit/950136c3c4e9a1072f00fc690b5f92aa7c323dbd): Tryng new node-pty build with multi-os matrix.

## Version v0.0.3

> March 17, 2025

- [`b50102b`](https://github.com/pixlcore/xysat/commit/b50102bb62f69a4750967e823e1b87ac92fa2c7c): Version 0.0.3

## Version v0.0.2

> March 17, 2025

- [`7c8b057`](https://github.com/pixlcore/xysat/commit/7c8b05703ca1621bcbde6b90f6cbd63b4ddd20ed): Version 0.0.2
- [`e1ca4f1`](https://github.com/pixlcore/xysat/commit/e1ca4f1dce133d62f5a6b04993aa065c2eb682e9): Typo fix in automation.

## Version v0.0.1

> March 17, 2025

- Initial beta release!
