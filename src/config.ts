import { readFileSync } from "fs";
import ini from "ini";

const config = ini.parse(readFileSync("./config.ini", "utf-8"));

export const defaultConfig = {
	botToken: "",
};

export default config as typeof defaultConfig;
