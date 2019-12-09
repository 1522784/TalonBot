// Class libary, now obselete
JS = require('jsclass');
JS.require('JS.Class');

//does this work? will it show up?

require("sugar");

// Account file
var bot = require("./bot.js");
var account = bot.account;

// Results database
var db = require("./util/db");

// Logging
var log4js = require('log4js');
//var logger = require('log4js').getLogger("battleroom");
var decisionslogger = require('log4js').getLogger("decisions");

// battle-engine
var Battle = require('./lance-battle-engine/battle');
var BattlePokemon = require('./lance-battle-engine/battlepokemon');

// Get pokemon showdown data files
var Abilities = require("./data/abilities").BattleAbilities;
var Items = require("./data/items").BattleItems;
var SideScripts = require('./data/scripts');

// Include underscore.js
var _ = require("underscore");

var clone = require("./clone/clone");

var program = require('commander'); // Get Command-line arguments

// Pokemon inference
var Inference = require("./data/moves");

var BattleRoom = new JS.Class({
    initialize: function(id, sendfunc) {
        this.id = id;
        this.title = "Untitled";
        this.send = sendfunc;

        // Construct a battle object that we will modify as our state
        this.state = Battle.construct(id, 'base', false);
        //Object.merge(this.state, SideScripts.BattleScripts);
        this.state.join('p1', 'botPlayer'); // We will be player 1 in our local simulation
        this.state.join('p2', 'humanPlayer');
        this.state.reportPercentages = true;

        this.previousState = null; // For TD Learning

        /*setTimeout(function() {
            sendfunc(account.message, id); // Notify User that this is a bot
            sendfunc("/timer", id); // Start timer (for user leaving or bot screw ups)
        }, 10000);*/

        this.decisions = [];
        this.log = "";

        // Save the last request ID
        this.last_rqid = 0

        this.state.start();
        
        this.randbat = id.indexOf("randombattle") != -1
    },
    init: function(data) {
        var log = data.split('\n');
        if (data.substr(0, 6) === '|init|') {
            log.shift();
        }
        if (log.length && log[0].substr(0, 7) === '|title|') {
            this.title = log[0].substr(7);
            log.shift();
            //logger.info("Title for " + this.id + " is " + this.title);
        }
    },
    //given a player and a pokemon, returns the corresponding pokemon object
    getPokemon: function(battleside, pokename) {
        for(var i = 0; i < battleside.pokemon.length; i++) {
            if(battleside.pokemon[i].name === pokename || //for mega pokemon
               battleside.pokemon[i].name.substr(0,pokename.length) === pokename)
                return battleside.pokemon[i];
        }
        return undefined; //otherwise Pokemon does not exist
    },
    //given a player and a pokemon, updates that pokemon in the battleside object
    updatePokemon: function(battleside, pokemon) {
        for(var i = 0; i < battleside.pokemon.length; i++) {
            if(battleside.pokemon[i].name === pokemon.name) {
                battleside.pokemon[i] = pokemon;
                return;
            }
        }
        //logger.info("Could not find " + pokemon.name + " in the battle side, creating new Pokemon.");
        for(var i = battleside.pokemon.length - 1; i >= 0; i--) {
            if(battleside.pokemon[i].name === "Bulbasaur") {
                battleside.pokemon[i] = pokemon;
                return;
            }
        }
    },

    //returns true if the player object is us
    isPlayer: function(player) {
        return player === this.side + 'a:' || player === this.side + ':' || player === this.side + 'a' || player === this.side;
    },
     // TODO: Add inference here for each pokemon
    updatePokemonOnTeamPreview: function(tokens) {
        var player = tokens[2];
        var pokeName = tokens[3].split(', ')[0]
        var has_item = (tokens[4] === 'item')

        // Only update other team's pokemon like this, since we know ours
        if (this.oppSide == player) {
            var battleside = this.state.p2;
            var pokemon = this.getPokemon(battleside, pokeName);

            if(!pokemon) {
                pokemon = this.getPokemon(battleside, "Bulbasaur");

                // TODO: Add move inference here
                var set = this.state.getTemplate(pokeName);
                var inference_data = Inference.getdata(pokeName.toLowerCase())
                
                
                set.level = 100;            // TODO: Something smarter here

                if(!!inference_data) {
                    set.moves = _.map(inference_data.moves, function(prob, name) {
                        return name
                    });

                    // Add the probabilistic attributes to the set
                    var prob_set = {}
                    prob_set.moves = _.map(inference_data.moves, function(prob, name) {
                        return [name, prob]
                    });

                    prob_set.items = _.map(inference_data.items, function(prob, name) {
                        return [name, prob]
                    });

                    prob_set.evs = _.map(inference_data.evs, function(evs) {
                        return evs
                    });

                    set.evs = {
                        hp: 85,
                        atk: 85,
                        def: 85,
                        spa: 85,
                        spd: 85,
                        spe: 252
                    }

                    set.probabilities = prob_set
                }
                else {
                    set.moves = set.randomBattleMoves
                }
                
                // TODO: Add ability inference here
                var abilities = Object.values(set.abilities).sort(function(a,b) {
                    return this.state.getAbility(b).rating - this.state.getAbility(a).rating;
                }.bind(this));
                set.ability = abilities[0];
                var old_pos = pokemon.position;

                // Create the pokemon
                pokemon = new BattlePokemon(set, battleside);
                pokemon.position = old_pos;
                pokemon.trueMoves = []; //gradually add moves as they are seen
                battleside.pokemon[old_pos] = pokemon;

                if (old_pos === 0){
                    battleside.active = [pokemon];
                    pokemon.isActive = true;
                }

                //Ensure that active pokemon is in slot zero
                battleside.pokemon = _.sortBy(battleside.pokemon, function(pokemon) { return pokemon == battleside.active[0] ? 0 : 1 });
                for(var i = 0; i < 6; i++) {
                    battleside.pokemon[i].position = i
                }
            }
        }
    },
    updatePokemonOnSwitch: function(tokens) {
        var level = tokens[3].split(', ')[1] ? tokens[3].split(', ')[1].substring(1) : 100;        

        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var nickname = tokens2[1];

        var pokeName = tokens[3].split(',')[0];

        var health_update = !!tokens[4]
        if(health_update){
            var tokens4 = tokens[4].split(/\/| /); //for healths
            var health = tokens4[0];
            var maxHealth = tokens4[1];
        }

        var battleside = undefined;

        if (this.isPlayer(player)) {
            //logger.info("Our pokemon has switched! " + tokens[2]);
            battleside = this.state.p1;
            //remove boosts for current pokemon
            this.state.p1.active[0].clearVolatile();
        } else {
            //logger.info("Opponents pokemon has switched! " + tokens[2]);
            this.has_p2_moved = true

            battleside = this.state.p2;
            
            //remove boosts for current pokemon
            this.state.p2.active[0].clearVolatile();
        }

        var pokemon = this.getPokemon(battleside, pokeName);

        if(!pokemon) { //pokemon has not been defined yet, so choose Bulbasaur
            //note: this will not quite work if the pokemon is actually Bulbasaur
            pokemon = this.getPokemon(battleside, "Bulbasaur");
            var set = this.state.getTemplate(pokeName);
            set.moves = set.randomBattleMoves;
            //set.moves = _.sample(set.randomBattleMoves, 4); //for efficiency, need to implement move ordering
            set.level = parseInt(level);
            //choose the best ability
            var abilities = Object.values(set.abilities).sort(function(a,b) {
                return this.state.getAbility(b).rating - this.state.getAbility(a).rating;
            }.bind(this));
            set.ability = abilities[0];

            // Add the probabilistic attributes to the set
            var prob_set = {}
            var inference_data = Inference.getdata(pokeName.toLowerCase())

            if(!!inference_data) {
                prob_set.items = _.map(inference_data.items, function(prob, name) {
                    return [name, prob]
                });
                set.probabilities = prob_set
            }

            // Assume all enemy mons are fully invested in speed
            set.evs = {
                    hp: 85,
                    atk: 85,
                    def: 85,
                    spa: 85,
                    spd: 85,
                    spe: 252
            }

            pokemon = new BattlePokemon(set, battleside);
            pokemon.trueMoves = []; //gradually add moves as they are seen
        }

        //opponent hp is recorded as percentage
        if(health_update) {
            pokemon.hp = Math.ceil(health / maxHealth * pokemon.maxhp);
        }
        battleside.active[0].position = pokemon.position;
        pokemon.position = 0;
        pokemon.nickname = nickname

        battleside.active[0].isActive = false;
        pokemon.isActive = true;
        this.updatePokemon(battleside,pokemon);

        battleside.active = [pokemon];

        //Ensure that active pokemon is in slot zero
        battleside.pokemon = _.sortBy(battleside.pokemon, function(pokemon) { return pokemon == battleside.active[0] ? 0 : 1 });
        for(var i = 0; i < 6; i++){
            battleside.pokemon[i].position = i
        }
    },
    updatePokemonOnMove: function(tokens) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var move = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
            this.has_p2_moved = true
        }
        
        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " on team " + battleside.name + " before in this battle. Should not have happened.");
            return;
        }
        var pokeName = pokemon.name

        //update last move (doesn't actually affect the bot...)
        pokemon.lastMove = toId(move);

        //if move is protect or detect, update stall counter
        if('stall' in pokemon.volatiles) {
            pokemon.volatiles.stall.counter++;
        }
        //update status duration
        if(pokemon.status) {
            pokemon.statusData.duration = (pokemon.statusData.duration?
                                           pokemon.statusData.duration+1:
                                           1);
        }

        //we are no longer newly switched (so we don't fakeout after the first turn)
        pokemon.activeTurns += 1;
        if(!this.isPlayer(player)) { //anticipate more about the Pokemon's moves
        if(!pokemon.trueMoves) pokemon.trueMoves = [];
            if(pokemon.trueMoves.indexOf(toId(move)) < 0 && pokemon.trueMoves.length < 4) {
                pokemon.trueMoves.push(toId(move));
                //logger.info("Determined that " + pokeName + " can use " + toId(move));
                //if we have collected all of the moves, eliminate all other possibilities
                if(pokemon.trueMoves.length >= 4) {
                    //logger.info("Collected all of " + pokeName + "'s moves!");
                    var newMoves = [];
                    var newMoveset = [];
                    for(var i = 0; i < pokemon.moveset.length; i++) {
                        if(pokemon.trueMoves.indexOf(pokemon.moveset[i].id) >= 0) {
                            newMoves.push(pokemon.moveset[i].id); //store id
                            newMoveset.push(pokemon.moveset[i]);  //store actual moves
                        }
                    }
                    pokemon.moves = newMoves;
                    pokemon.moveset = newMoveset;
                }

            }
        }

        this.updatePokemon(battleside, pokemon);

    },
    updatePokemonOnFaint: function(tokens) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        pokemon.hp = 0;
        pokemon.switchFlag = false;
        pokemon.status = 'fnt';

        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonOnDamage: function(tokens) {
        //extract damage dealt to a particular pokemon
        //also takes into account passives
        //note that opponent health is recorded as percent. Keep this in mind
        // TODO: Use damage to infer about the opponents stats / items 

        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var tokens3 = tokens[3].split(/\/| /);       
        var health = tokens3[0];
        var maxHealth = tokens3[1];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        //update hp
        pokemon.hp = Math.ceil(health / maxHealth * pokemon.maxhp);
        this.updatePokemon(battleside, pokemon);

    },
    updatePokemonOnBoost: function(tokens, isBoost) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var stat = tokens[3];
        var boostCount = parseInt(tokens[4]);
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        if(isBoost) {
            if(stat in pokemon.boosts)
                pokemon.boosts[stat] += boostCount;
            else
                pokemon.boosts[stat] = boostCount;
        } else {
            if(stat in pokemon.boosts)
                pokemon.boosts[stat] -= boostCount;
            else
                pokemon.boosts[stat] = -boostCount;
        }
        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonSetBoost: function(tokens) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var stat = tokens[3];
        var boostCount = parseInt(tokens[4]);
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        pokemon.boosts[stat] = boostCount;
        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonRestoreBoost: function(tokens) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];        
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        for(var stat in pokemon.boosts) {
            if(pokemon.boosts[stat] < 0)
                delete pokemon.boosts[stat];
        }
        this.updatePokemon(battleside, pokemon);


    },
    updatePokemonStart: function(tokens, newStatus) {
        //add condition such as leech seed, substitute, ability, confusion, encore
        //move: yawn, etc.
        //ability: flash fire, etc.

        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var status = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})

        if(status.substring(0,4) === 'move') {
            status = status.substring(6);
        } else if(status.substring(0,7) === 'ability') {
            status = status.substring(9);
        }

        if(newStatus) {
            pokemon.addVolatile(status);
        } else {
            pokemon.removeVolatile(status);
        }
        this.updatePokemon(battleside, pokemon);
    },
    updateField: function(tokens, newField) {
        //as far as I know, only applies to trick room, which is a pseudo-weather
        var fieldStatus = tokens[2].substring(6);
        if(newField) {
            this.state.addPseudoWeather(fieldStatus);
        } else {
            this.state.removePseudoWeather(fieldStatus);
        }
    },
    updateWeather: function(tokens) {
        var weather = tokens[2];
        if(weather === "none") {
            this.state.clearWeather();
        } else {
            this.state.setWeather(weather);
            //we might want to keep track of how long the weather has been lasting...
            //might be done automatically for us
        }
    },
    updateSideCondition: function(tokens, newSide) {
        var player = tokens[2].split(' ')[0];
        var sideStatus = tokens[3];
        if(sideStatus.substring(0,4) === "move")
            sideStatus = tokens[3].substring(6);
        var battleside = undefined;
        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        if(newSide) {
            battleside.addSideCondition(sideStatus);
            //Note: can have multiple layers of toxic spikes or spikes
        } else {
            battleside.removeSideCondition(sideStatus);
            //remove side status
        }
    },
    updatePokemonStatus: function(tokens, newStatus) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var status = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})

        if(newStatus) {
            pokemon.setStatus(status);
            //record a new Pokemon's status
            //also keep track of how long the status has been going? relevant for toxic poison
            //actually, might be done by default
        } else {
            pokemon.clearStatus();
            //heal a Pokemon's status
        }
        this.updatePokemon(battleside, pokemon);
    },
    updatePokemonOnItem: function(tokens, newItem) {
        //record that a pokemon has an item. Most relevant if a Pokemon has an air balloon/chesto berry
        //TODO: try to predict the opponent's current item

        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var item = tokens[3];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})

        if(newItem) {
            pokemon.setItem(item);
        } else {
            pokemon.clearItem(item);
        }
        this.updatePokemon(battleside, pokemon);
    },

    //Apply mega evolution effects, or aegislash/meloetta
    updatePokemonOnFormeChange: function(tokens) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var tokens3 = tokens[3].split(', ');
        var newPokeName = tokens3[0];
        var battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        //Note: crashes when the bot mega evolves.
        //logger.info(pokeName + " has transformed into " + newPokeName + "!");
        var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})

        //apply forme change
        pokemon.formeChange(newPokeName);
        this.updatePokemon(battleside, pokemon);
    },
    //for ditto exclusively
    updatePokemonOnTransform: function(tokens) {
        var tokens2 = tokens[2].split(': ');
        var player = tokens2[0];
        var pokeName = tokens2[1];
        var tokens3 = tokens[3].split(' ');        
        var newPokeName = tokens3[1];
        var battleside = undefined;
        var pokemon = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
            var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
            pokemon.transformInto(this.state.p2.active[0]);
        } else {
            battleside = this.state.p2;
            var pokemon = _.find(battleside.pokemon, {'nickname':pokeName})
            pokemon.transformInto(this.state.p1.active[0]);
        }
        this.updatePokemon(battleside, pokemon);

    },
    recieve: function(data) {
        if (!data) return;

        var self = this;

        //logger.trace("<< " + data);

        if (data.substr(0, 6) === '|init|') {
            return this.init(data);
        }
        if (data.substr(0, 9) === '|request|') {
            return this.receiveRequest(JSON.parse(data.substr(9)));
        }

        var log = data.split('\n');
        for (var i = 0; i < log.length; i++) {
            this.log += log[i] + "\n";

            var tokens = log[i].split('|');
            if (tokens.length > 1) {

                if (tokens[1] === 'tier') {
                    this.tier = tokens[2];
                } else if (tokens[1] === 'teampreview') {       // TODO: Choose lead better
                    this.send("/team 123456|" + this.last_rqid, self.id);
                } else if (tokens[1] === 'win') {
                    this.send("gg", this.id);

                    this.winner = tokens[2];
                    if (this.winner == account.username) {
                        //logger.info(this.title + ": I won this game");
                    } else {
                        //logger.info(this.title + ": I lost this game");
                    }

                    if(program.net === "update" && this.previousState) {
                        var playerAlive = _.any(this.state.p1.pokemon, function(pokemon) { return pokemon.hp > 0; });
                        var opponentAlive = _.any(this.state.p2.pokemon, function(pokemon) { return pokemon.hp > 0; });

                        if(!playerAlive || !opponentAlive) minimaxbot.train_net(this.previousState, null, (this.winner == account.username));
                    }

                    if(!program.nosave) this.saveResult();

                    // Leave in two seconds
                    var battleroom = this;
                    /*setTimeout(function() {
                        battleroom.send("/leave " + battleroom.id);
                    }, 2000);*/
                } else if(tokens[1] === 'turn') {
                    this.has_p2_moved = false
                } else if (tokens[1] === 'poke') {
                    this.updatePokemonOnTeamPreview(tokens);
                } else if (tokens[1] === 'switch' || tokens[1] === 'drag' || tokens[1] === 'replace') {
                    this.updatePokemonOnSwitch(tokens);
                } else if (tokens[1] === 'move') {
                    this.updatePokemonOnMove(tokens);
                } else if(tokens[1] === 'faint') { //we could outright remove a pokemon...
                    this.updatePokemonOnFaint(tokens);
                    //record that pokemon has fainted
                } else if(tokens[1] === 'detailschange' || tokens[1] === 'formechange') {
                    this.updatePokemonOnFormeChange(tokens);
                } else if(tokens[1] === '-transform') {
                    this.updatePokemonOnTransform(tokens);
                } else if(tokens[1] === '-damage') { //Error: not getting to here...
                    this.updatePokemonOnDamage(tokens);
                } else if(tokens[1] === '-heal') {
                    this.updatePokemonOnDamage(tokens);
                } else if(tokens[1] === '-boost') {
                    this.updatePokemonOnBoost(tokens, true);
                } else if(tokens[1] === '-unboost') {
                    this.updatePokemonOnBoost(tokens, false);
                } else if(tokens[1] === '-setboost') {
                    this.updatePokemonSetBoost(tokens);
                } else if(tokens[1] === '-restoreboost') {
                    this.updatePokemonRestoreBoost(tokens);
                } else if(tokens[1] === '-start') {
                    this.updatePokemonStart(tokens, true);
                } else if(tokens[1] === '-end') {
                    this.updatePokemonStart(tokens, false);
                } else if(tokens[1] === '-fieldstart') {
                    this.updateField(tokens, true);
                } else if(tokens[1] === '-fieldend') {
                    this.updateField(tokens, false);
                } else if(tokens[1] === '-weather') {
                    this.updateWeather(tokens);
                } else if(tokens[1] === '-sidestart') {
                    this.updateSideCondition(tokens, true);
                } else if(tokens[1] === '-sideend') {
                    this.updateSideCondition(tokens, false);
                } else if(tokens[1] === '-status') {
                    this.updatePokemonStatus(tokens, true);
                } else if(tokens[1] === '-curestatus') {
                    this.updatePokemonStatus(tokens, false);
                } else if(tokens[1] === '-item') {
                    this.updatePokemonOnItem(tokens, true);
                } else if(tokens[1] === '-enditem') {
                    this.updatePokemonOnItem(tokens, false);
                } else if(tokens[1] === '-ability') {
                    //relatively situational -- important for mold breaker/teravolt, etc.
                    //needs to be recorded so that we don't accidentally lose a pokemon

                    //We don't actually care about the rest of these effects, as they are merely visual
                } else if(tokens[1] === '-supereffective') {

                } else if(tokens[1] === '-crit') {

                } else if(tokens[1] === '-singleturn') { //for protect. But we only care about damage...

                } else if(tokens[1] === 'c') {//chat message. ignore. (or should we?)

                } else if(tokens[1] === '-activate') { //protect, wonder guard, etc.

                } else if(tokens[1] === '-fail') {

                } else if(tokens[1] === '-immune') {

                } else if(tokens[1] === 'message') {

                } else if(tokens[1] === 'cant') {

                } else if(tokens[1] === 'leave') {
               
                } else if(tokens[1] === 'error') {
                    //logger.error("Server Error: " + JSON.stringify(data))
                } else if(tokens[1]) { //what if token is defined
                    //logger.info("Error: could not parse token '" + tokens[1] + "'. This needs to be implemented");
                }

            }
        }
    },
    saveResult: function() {
        // Save game data to data base
        game = {
            "title": this.title,
            "id": this.id,
            "win": (this.winner == account.username),
            "date": new Date(),
            "decisions": "[]", //JSON.stringify(this.decisions),
            "log": this.log,
            "tier": this.tier
        };
        db.insert(game, function(err, newDoc) {});
    },
    receiveRequest: function(request) {
        if (!request) {
            this.side = '';
            return;
        }

        this.last_rqid = request.rqid

        if (request.side) this.updateSide(request, true);

        if (request.active) //logger.info(this.title + ": I need to make a move.");
        if (request.forceSwitch){
            //logger.info(this.title + ": I need to make a switch.");
            //logger.info(this.title + ": I need to make a switch.");
        }

        if (!!request.active || !!request.forceSwitch) this.makeMove(request);
    },

    //note: we should not be recreating pokemon each time
    //is this redundant?
    updateSide: function(request) {

        var sideData = request.side
        if (!sideData || !sideData.id) return;
        //logger.info("Starting to update my side data.");
        
        // Update each pokemon
        for (var i = 0; i < sideData.pokemon.length; ++i) {
            var pokemon = sideData.pokemon[i];

            var details = pokemon.details.split(",");
            var name = details[0].trim();
            var nickname = pokemon.ident.split(": ")[1]
            var level = details[1] ? parseInt(details[1].trim().substring(1)) : 100;
            var gender = details[2] ? details[2].trim() : null;

            var template = {
                name: name,
                moves: pokemon.moves,
                ability: "None",//Abilities[pokemon.baseAbility].name,
                evs: {
                    hp: 85,
                    atk: 85,
                    def: 85,
                    spa: 85,
                    spd: 85,
                    spe: 85
                },
                ivs: {
                    hp: 31,
                    atk: 31,
                    def: 31,
                    spa: 31,
                    spd: 31,
                    spe: 31
                },
                item: (!pokemon.item || pokemon.item === '') ? '' : Items[pokemon.item].name,
                level: level,
                active: pokemon.active,
                shiny: false
            };

            
            var inference_data = Inference.getdata(name.toLowerCase())
            
            if(!!inference_data) {
                // Add the probabilistic attributes to the set
                var prob_set = {}
                prob_set.moves = _.map(inference_data.moves, function(prob, name) {
                    return [name, prob]
                });                

                prob_set.items = _.map(inference_data.items, function(prob, name) {
                    return [name, prob]
                });

                prob_set.evs = _.map(inference_data.evs, function(evs) {
                    return evs
                });
                template.probabilities = prob_set
            }

            //keep track of old pokemon
            var oldPokemon = this.state.p1.pokemon[i];

            // Initialize pokemon
            this.state.p1.pokemon[i] = new BattlePokemon(template, this.state.p1);
            this.state.p1.pokemon[i].position = i;
            this.state.p1.pokemon[i].trueMoves = oldPokemon.trueMoves
            this.state.p1.pokemon[i].nickname = nickname

            // Update the pokemon object with latest stats
            for (var stat in pokemon.stats) {
                this.state.p1.pokemon[i].baseStats[stat] = pokemon.stats[stat];
            }
            // Update health/status effects, if any
            var condition = pokemon.condition.split(/\/| /);
            this.state.p1.pokemon[i].hp = parseInt(condition[0]);
            if(condition.length > 2) {//add status condition
                this.state.p1.pokemon[i].setStatus(condition[2]); //necessary
            }
            if(oldPokemon.isActive && oldPokemon.statusData) { //keep old duration
                pokemon.statusData = oldPokemon.statusData;
            }            

            // Keep old boosts
            this.state.p1.pokemon[i].boosts = oldPokemon.boosts;

            // Keep old volatiles
            this.state.p1.pokemon[i].volatiles = oldPokemon.volatiles;

            if (pokemon.active) {
                this.state.p1.active = [this.state.p1.pokemon[i]];
                this.state.p1.pokemon[i].isActive = true;
            }

            // Confirmation that health and status transfer working
            ////logger.info(this.state.p1.pokemon[i].name + " " + this.state.p1.pokemon[i].hp + "/" + this.state.p1.pokemon[i].maxhp + " " + this.state.p1.pokemon[i].status);
        }

        // Update the active pokemon's moves
        if(request.active) {
            var active_poke = this.state.p1.active[0]
            _.each(request.active[0].moves, function(move){
                var local_move = _.find(active_poke.moveset, function(m){
                    return m.id === move.id
                });
                local_move.disabled = move.disabled
                local_move.pp = move.pp
            });
        }

        // Enforce that the active pokemon is in the first slot
        this.state.p1.pokemon = _.sortBy(this.state.p1.pokemon, function(pokemon) { return pokemon.isActive ? 0 : 1 });
        for(var i = 0; i < 6; i++){
            this.state.p1.pokemon[i].position = i
        }

        this.side = sideData.id;
        this.oppSide = (this.side === "p1") ? "p2" : "p1";
        //logger.info(this.title + ": My current side is " + this.side);
    },

    /** Function which is called when our client is asked to make a move */
    makeMove: function(request) {
        var room = this;

        let algorithm = program.algorithm;
        if(room.algorithm) algorithm = room.algorithm;

            /*if(program.net === "update") {
                if(room.previousState != null) minimaxbot.train_net(room.previousState, room.state);
                room.previousState = clone(room.state);
            }*/

            var decision = BattleRoom.parseRequest(request);

            // Use specified algorithm to determine resulting choice
            var result = undefined;
            if(decision.choices.length == 1) result = decision.choices[0];
            else if(algorithm === "minimax") result = minimaxbot.decide(clone(room.state), decision.choices);
            else if(algorithm === "mcts") result = mctsbot.decide(clone(room.state), decision.choices);
            else if(algorithm === "samcts") result = mcts_duct.decide(clone(room.state), decision.choices, this.has_p2_moved);
            else if(algorithm === "expectimax") result = expectimax.decide(clone(room.state), decision.choices, this.has_p2_moved);
            else if(algorithm === "greedy") result = greedybot.decide(clone(room.state), decision.choices);
            else if(algorithm === "random") result = randombot.decide(clone(room.state), decision.choices);

            room.decisions.push(result);
            room.send("/choose " + BattleRoom.toChoiceString(result, room.state.p1) + "|" + decision.rqid, room.id);
    },
    // Static class methods
    extend: {
        toChoiceString: function(choice, battleside) {
            if (choice.type == "move") {
                if(battleside && battleside.active[0].canMegaEvo) //mega evolve if possible
                    return "move " + choice.id + " mega";
                else
                    return "move " + choice.id;
            } else if (choice.type == "switch") {
                return "switch " + (choice.id + 1);
            }
        },
        parseRequest: function(request) {
            var choices = [];

            if(!request) return choices; // Empty request
            if(request.wait) return choices; // This player is not supposed to make a move

            var alive = _.some(request.side.pokemon, function(pokemon, index) {
                return (pokemon.active && pokemon.condition.indexOf("fnt") < 0)
            });

            // If we can make a move
            if (request.active) {
                if(alive === true) {
                    _.each(request.active[0].moves, function(move) {
                        if (move.disabled !== true) {
                            choices.push({
                                "type": "move",
                                "id": move.id
                            });
                        }
                    });
                }
            }

            // Switching options
            var trapped = (request.active) ? (request.active[0].trapped || request.active[0].maybeTrapped) : false;
            var canSwitch = request.forceSwitch || !trapped || !alive
            if (canSwitch) {
                _.each(request.side.pokemon, function(pokemon, index) {
                    if (pokemon.condition.indexOf("fnt") < 0 && !pokemon.active && pokemon.ident.indexOf('Bulbasaur') < 0) {
                        choices.push({
                            "type": "switch",
                            "id": index
                        });
                    }
                });
            }
            
            // Cannot happen for the current turn, so just struggle
            // TODO: Fix bug where last pokemon knows switching move
            if(_.size(choices) === 0) {
                console.log(JSON.stringify(request))
                console.log("No moves found " + trapped + " " + canSwitch + " " + request.forceSwitch + " " + alive)
                choices.push({
                    "type": "move",
                    "id": "struggle"
                });
            }

            return {
                rqid: request.rqid,
                choices: choices
            };
        }
    }
});
module.exports = BattleRoom;

var minimaxbot = require("./bots/minimaxbot");
var mctsbot = require("./bots/mctsbot");
var mcts_duct = require("./bots/mcts_duct");
var expectimax = require("./bots/expectimax");
var greedybot = require("./bots/greedybot");
var randombot = require("./bots/randombot");
