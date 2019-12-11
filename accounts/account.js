var program = require('commander');
var fs = require('fs');

const DEFAULT_ACCOUNT_FILE = "accounts/account.json";
let accountFile = program.account || DEFAULT_ACCOUNT_FILE;
var account = JSON.parse(fs.readFileSync(accountFile));
module.exports = account;