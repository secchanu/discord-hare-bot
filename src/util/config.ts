import { readFileSync } from "fs";
import ini from "ini";

export const defaultConfig = {
	enable: true,
};

const config: typeof defaultConfig = {
	...defaultConfig,
	...(() => {
		try {
			return ini.parse(readFileSync("./config.ini", "utf-8")).util;
		} catch {
			return {};
		}
	})(),
};

export default config;
