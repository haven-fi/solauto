import { PublicKey } from "@solana/web3.js";

interface ReserveAccounts {
    reserve: PublicKey;
    pythPrice: PublicKey;
    switchboardPrice: PublicKey;
    liquidityTokenMint: PublicKey;
    collateralTokenMint?: PublicKey;
  }
  
  export interface SolendAccounts {
    solendProgram: PublicKey;
    lendingMarket: PublicKey;
    pythProgram: PublicKey;
    switchboardProgram: PublicKey;
    solReserve: ReserveAccounts;
    usdcReserve: ReserveAccounts;
  }
  