import { writeFileSync } from "fs";
import ini from "ini";

import { default as baseConfig } from "./config";
import { default as roomConfig } from "./room/config";
import { default as utilConfig } from "./util/config";

const config = {
	...baseConfig,
	room: roomConfig,
	util: utilConfig,
};

writeFileSync("./config.ini", ini.stringify(config));
