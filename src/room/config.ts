import { readFileSync } from "fs";
import ini from "ini";

export const defaultConfig = {
	enable: true,
	readyChannelId: "",
	useGame: true,
	wantedChannelId: "",
	ignoreRoleIds: [""],
};

const config: typeof defaultConfig = {
	...defaultConfig,
	...(() => {
		try {
			return ini.parse(readFileSync("./config.ini", "utf-8")).room;
		} catch {
			return {};
		}
	})(),
};

export default config;
