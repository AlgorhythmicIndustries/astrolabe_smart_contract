const { PublicKey } = require('@solana/web3.js');

// The address the program is expecting
const expectedAddress = new PublicKey('CmuoUXFxULbaMf8WydJH5vSszKc2gLc5v4QfTYbkc5Ku');
console.log('Expected address bytes:', Array.from(expectedAddress.toBytes()).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Your wallet
const yourWallet = new PublicKey('7iL8DTE344J2LgoZ8VScstAFowtXjfTp2py6jMEkar1W');
console.log('Your wallet bytes:', Array.from(yourWallet.toBytes()).map(b => b.toString(16).padStart(2, '0')).join(' '));

// The address we parsed from config
const configTreasury = new PublicKey('Ab4AFsZSFX91yzWahQyu84caCvcQZZ4eN11U8gzyfGdU');
console.log('Config treasury bytes:', Array.from(configTreasury.toBytes()).map(b => b.toString(16).padStart(2, '0')).join(' ')); 