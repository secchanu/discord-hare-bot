import { writeFileSync } from "fs";
import ini from "ini";

import { default as baseConfig } from "./config";
import { default as roomConfig } from "./room/config";

const config = {
	...baseConfig,
	room: roomConfig,
};

writeFileSync("./config.ini", ini.stringify(config));
