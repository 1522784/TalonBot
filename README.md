Lance: A Pokemon Showdown AI
===========

## Disclosure
Credit goes to the [Percymon](https://github.com/rameshvarun/showdownbot) project built in Node.js, on top of which this AI is built. Percymon is a Pokemon battling AI that runs on the Pokemon Showdown server.

![Imgur](http://i.imgur.com/uasrTOy.png)

## Setting up the repository

To set up the server, you need to first install dependencies:

    npm install

This project requires Node.js >= 4.x, as it requires ES6 class support.

In order to actually play games you must register an account on [Pokemon Showdown](http://play.pokemonshowdown.com/). Once the log-in information has been obtained, you need to create an `account.json` file containing information. The format of `account.json` is as follows:

    {
        "username" : "sillybot",
        "password": : "arbitrary password",
        "message" : "gl hf"
    }

The battles themselves take place entirely on the Pokemon Showdown server, so it's best to have a second account with which to use the built-in spectate feature offered by Pokemon Showdown in order to monitor the AI.

The `message` field indicates the message that will be sent when the bot first connects to the game.

Finally, to start the server, issue the following command:

    node bot.js

By default, the server searches for rated OU when the option is toggled in the web console. There are several command line options that can be supplied:

    --console: Only start the web console, not the game playing bot.
    --host [url]: The websocket endpoint of the host to try to connect to. Default: http://sim.smogon.com:8000/showdown
    --port [port]: The port on which to serve the web console. Default: 3000    
    --algorithm [algorithm]', "Can be 'minimax', 'mcts', 'samcts', 'expectimax', 'greedy', or 'random'. Default: samcts
    --account [file]: File from which to load credentials. Default: account.json
    --nosave: Don't save games to the in-memory db.
    --nolog: Don't append to log files.
    --startchallenging: Start out challenging, instead of requiring a manual activation first.
