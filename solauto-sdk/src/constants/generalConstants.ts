import { PublicKey } from "@solana/web3.js";
import { buildIronforgeApiUrl } from "../utils";

export const USD_DECIMALS = 9;
export const SOLAUTO_FEES_WALLET = new PublicKey("AprYCPiVeKMCgjQ2ZufwChMzvQ5kFjJo2ekTLSkXsQDm");
export const SOLAUTO_MANAGER = new PublicKey("MNGRcX4nc7quPdzBbNKJ4ScK5EE73JnwJVGxuJXhHCY");

export const LOCAL_IRONFORGE_API_URL = buildIronforgeApiUrl(process.env.IRONFORGE_API_KEY!);
