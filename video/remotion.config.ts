import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// x264 con CRF bajo: el material es diagramas y texto, donde el banding
// se nota mucho mas que en video real.
Config.setCodec('h264');
Config.setCrf(18);
