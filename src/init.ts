import { writeFileSync } from "fs";
import ini from "ini";

import { default as baseConfig } from "./config";

const config = {
	...baseConfig,
};

writeFileSync("./config.ini", ini.stringify(config));
