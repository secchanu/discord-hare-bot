import { readFileSync } from "fs";
import ini from "ini";

const defaultConfig = {
	botToken: "",
};

const config: typeof defaultConfig = {
	...defaultConfig,
	...(() => {
		try {
			return ini.parse(readFileSync("./config.ini", "utf-8"));
		} catch {
			return {};
		}
	})(),
};

export default config;
