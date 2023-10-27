import { Client, GatewayIntentBits } from "discord.js";

//設定の読み込み
import config from "./config";

//クライアントの作成
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildScheduledEvents,
		GatewayIntentBits.GuildPresences,
	],
});

//ログイン
client.login(config.botToken);
