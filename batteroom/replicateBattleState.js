// battle-engine
let Battle = require('../servercode/sim/battle');
let BattlePokemon = require('../servercode/sim/pokemon');
 
// Include underscore.js
let _ = require("underscore");
let clone = require("../clone/clone");

class Replicater {
    constructor(id){
        let format = id.slice(7, -10);

        this.state = new Battle({formatid: format});
        this.state.id = id
        this.state.join('p1', 'botPlayer'); // We will be player 1 in our local simulation
        this.state.join('p2', 'humanPlayer');
        this.state.reportPercentages = true;
        this.state.p1.pokemon = [];
        this.state.p2.pokemon = [];
        
        this.log = "";
        this.last_rqid = 0

        this.state.start();
    }
    
    init(data) {
        let log = data.split('\n');
        if (data.substr(0, 6) === '|init|' || data.substr(0, 6) === '|request|') {
            log.shift();
        }
        if (log.length && log[0].substr(0, 7) === '|title|') {
            this.title = log[0].substr(7);
            log.shift();
            //logger.info("Title for " + this.id + " is " + this.title);
        }
    }

    //Order Pokemon in array this.state.p1.pokemon to match the order in the parameter request
    getState(request){
        if(request){
            this.orderPokemonToMatchRequest(request);
        }

        return this.state;
    }

    orderPokemonToMatchRequest(request){
        let orderedList = [null, null, null, null, null, null];

        //Order of pokemon in request
        let order = request.side.pokemon.map(pokemon => pokemon.ident.substr(4));

        for(let poke of this.state.p1.pokemon){
            let orderIndex = order.findIndex(pokeName => poke.name === pokeName);
            if(orderIndex < 0)throw new Error("Index of Pokemon name " + poke.name + " can't be found in pokemon list of request: " + order);
            if(orderedList[orderIndex]) throw new Error("Two pokemon with same name: " + poke.name + ". Both belong to index " + orderIndex);
            poke.position = orderIndex;
            orderedList[orderIndex] = poke;
        }

        orderedList = orderedList.filter(poke => poke);
        
        this.state.p1.pokemon = orderedList;
    }

    updateState(data){
        let log = data.split('\n');
        for (let i = 0; i < log.length; i++) {
            this.log += log[i] + "\n";

            let tokens = log[i].split('|');
            if (tokens.length > 1) {

                if (tokens[1] === 'tier') {
                    this.tier = tokens[2];
                } else if (tokens[1] === 'teampreview') {
                    //this.send("/team 123456|" + this.last_rqid, self.id);
                } else if (tokens[1] === 'win') {
                    this.winner = tokens[2];
                } else if(tokens[1] === 'turn') {
                    this.state.nextTurn();
                    this.has_p2_moved = false
                } else if (tokens[1] === 'poke') {
                    this.updatePokemonOnTeamPreview(tokens);
                } else if (tokens[1] === 'switch' || tokens[1] === 'drag' || tokens[1] === 'replace') {
                    this.updatePokemonOnSwitch(tokens);
                } else if (tokens[1] === 'move') {
                    this.updatePokemonOnMove(tokens, log.slice(i+1));
                } else if(tokens[1] === 'faint') { //we could outright remove a pokemon...
                    this.updatePokemonOnFaint(tokens);
                    //record that pokemon has fainted
                } else if(tokens[1] === 'detailschange' || tokens[1] === 'formechange') {
                    this.updatePokemonOnFormeChange(tokens);
                } else if(tokens[1] === '-transform') {
                    this.updatePokemonOnFormeChange(tokens.map((token, index) => index === 3 ? token.slice(5) : token));
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
                } else if(tokens[1] === '-sidestart') {
                    this.updateSideCondition(tokens, true);
                } else if(tokens[1] === '-sideend') {
                    this.updateSideCondition(tokens, false);
                } else if(tokens[1] === '-status') {
                    this.updatePokemonStatus(tokens, true);
                } else if(tokens[1] === '-curestatus') {
                    this.updatePokemonStatus(tokens, false);
                } else if(tokens[1] === '-mustrecharge') {
                    //this.updatePokemonRecharge(tokens);
                } else if(tokens[1] === '-supereffective') {

                } else if(tokens[1] === '-crit') {

                } else if(tokens[1] === '-singleturn') { //for protect. But we only care about damage...

                } else if(tokens[1] === 'c') {//chat message. ignore. (or should we?)

                } else if(tokens[1] === '-activate') { //protect, wonder guard, etc.

                } else if(tokens[1] === '-fail') {

                } else if(tokens[1] === '-immune') {

                } else if(tokens[1] === 'message') {

                } else if(tokens[1] === 'cant') {
                    this.updatePokemonOnCant(tokens);
                } else if(tokens[1] === 'leave') {

                } else if(tokens[1] === 'teamsize') {
                    let pid = this.isPlayer(tokens[2]) ? "p1" : "p2";
                    this.state[pid].maxTeamSize = parseInt(tokens[3]);
                } else if(tokens[1] === 'error') {
                    //logger.error("Server Error: " + JSON.stringify(data))
                } else if(tokens[1]) { //what if token is defined
                    //logger.info("Error: could not parse token '" + tokens[1] + "'. This needs to be implemented");
                }

            }
        }

        if(this.state.p1.pokemon.some(poke => poke.hp === 0 && !poke.faintMarkerFromBattleRoom) || 
            this.state.p2.pokemon.some(poke => poke.hp === 0 && !poke.faintMarkerFromBattleRoom)){
                debugger;
                //this.state = this.previousState;
                //this.recieve(data);
            }

        let p1MustSwitch = this.state.p1.active.some(poke => poke.switchFlag);
        let p2MustSwitch = this.state.p2.active.some(poke => poke.switchFlag);
        let requestType = (p1MustSwitch || p2MustSwitch) ? "switch" : "move";
        this.state.makeRequest(requestType);

        this.state.logs = this.log;
    }
    
    getPokemon(battleside, pokename) {
        for(let i = 0; i < battleside.pokemon.length; i++) {
            if(battleside.pokemon[i].name === pokename || //for mega pokemon
               battleside.pokemon[i].name.substr(0,pokename.length) === pokename)
                return battleside.pokemon[i];
        }

        return undefined; //otherwise Pokemon does not exist
    }
    
    updatePokemon(battleside, pokemon) {
        for(let i = 0; i < battleside.pokemon.length; i++) {
            if(battleside.pokemon[i].name === pokemon.name) {
                battleside.pokemon[i] = pokemon;
                return;
            }
        }
        battleside.pokemon.push(pokemon);
    }

    isPlayer(player) {
        return player === this.side + 'a:' || player === this.side + ':' || player === this.side + 'a' || player === this.side;
    }
    
    updatePokemonOnTeamPreview(tokens) {
        let player = tokens[2];
        let pokeName = tokens[3].split(', ')[0]
        let has_item = (tokens[4] === 'item')

        // Only update other team's pokemon like this, since we know ours
        if (this.oppSide == player) {
            let battleside = this.state.p2;
            let pokemon = this.getPokemon(battleside, pokeName);

            if(!pokemon) {
                pokemon = null
            }
        }
    }

    updatePokemonOnSwitch(tokens) {
        let level =  tokens[3].split(', ')[1] ? tokens[3].split(', ')[1].substring(1) : 100;

        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let nickname = tokens2[1];

        let pokeName = tokens[3].split(',')[0];

        let health;
        let maxHealth;
        let health_update = !!tokens[4]
        if(health_update){
            let tokens4 = tokens[4].split(/\/| /); //for healths
            health = tokens4[0];
            maxHealth = tokens4[1];
        }

        let battleside = undefined;

        if (this.isPlayer(player)) {
            //logger.info("Our pokemon has switched! " + tokens[2]);
            battleside = this.state.p1;

            //remove boosts for current pokemon
            if(this.state.p1.active[0]) this.state.p1.active[0].clearVolatile();
        } else {
            //logger.info("Opponents pokemon has switched! " + tokens[2]);
            this.has_p2_moved = true
            battleside = this.state.p2;
            
            //remove boosts for current pokemon
            if(this.state.p2.active[0]) this.state.p2.active[0].clearVolatile();
        }

        let pokemon = this.getPokemon(battleside, pokeName);

        if (!pokemon) {
            let set = this.state.getTemplate(pokeName);
            set.name = nickname;
            set.level = parseInt(level);
            //logger.info("Level: " + set.level);
            if(this.state.gen <= 2)
                set.evs = {hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252};
            pokemon = new BattlePokemon(set, battleside);
            pokemon.trueMoves = []; //gradually add moves as they are seen
        }

        //opponent hp is recorded as percentage
        if(health_update) {
            pokemon.hp = Math.ceil(health / maxHealth * pokemon.maxhp);
        }
        if(this.state.p2.active[0]) {
            battleside.active[0].position = pokemon.position;
            battleside.active[0].isActive = false;
        }
        pokemon.position = 0;

        if(this.state.p2.active[0]) battleside.active[0].isActive = false;
        pokemon.isActive = true;
        this.updatePokemon(battleside, pokemon);

        battleside.active = [pokemon];
        pokemon.clearVolatile();

        //Ensure that active pokemon is in slot zero
        battleside.pokemon = _.sortBy(battleside.pokemon, function(pokemon) { return pokemon == battleside.active[0] ? 0 : 1 });
        for(let i = 0; i < 6; i++){
            if (battleside.pokemon[i])
                battleside.pokemon[i].position = i;
        }
    }

    updatePokemonOnMove(tokens, followingLines) {
        let self = this;
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let move = tokens[3];
        let battleside = undefined;
        let targetSide = undefined;
        let tokens4 = tokens[4].split(": ");
        let targetName = tokens4[1];
        let tokens5following = tokens.slice(5);

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
            targetSide = this.state.p2;
        } else {
            battleside = this.state.p2;
            targetSide = this.state.p1;
            this.has_p2_moved = true
        }
        
        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName)
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " on team " + battleside.name + " before in this battle. Should not have happened.");
            return;
        }

        this.updatePokemon(battleside, pokemon);
        
        let moveObj = this.state.getMove(move);
        if(!moveObj) {
            debugger; 
            throw new Error("Can't find move " + move + " in Pokemon's moveset " + pokemon.moveSlots.map(move => move.name + " "))
        }
        let target = targetSide.pokemon.find(poke => poke.name === targetName);
        let miss = tokens5following.some(token => token === "[miss]");

        let sourceString = tokens5following.find(token => token.indexOf("[from]") === 0);
        let source = null;
        if(sourceString) sourceString = sourceString.slice(6);
        source = this.state.getEffect(sourceString);

        if(["Mirror Move", "Metronome"].includes(sourceString)) return;

        //we are no longer newly switched (so we don't fakeout after the first turn)
        pokemon.activeTurns += 1;
        if(!this.isPlayer(player)) { //anticipate more about the Pokemon's moves
            if(!pokemon.trueMoves.includes(toId(move)) && pokemon.trueMoves.length < 4 && toId(move) != "struggle") {
                pokemon.trueMoves.push(toId(move));
            }
            if(!pokemon.moveSlots.some(moveSlot => moveSlot.id === toId(move))){
                let moveObj = this.state.getMove(move);
                moveObj.pp = moveObj.pp/5*8;
                moveObj.maxpp = moveObj.pp;
                pokemon.baseMoveSlots.push(moveObj);
                pokemon.moveSlots.push(moveObj); 
                //logger.info("add " + toId(move) + " to moveslots")
            }
        }

        let damageDealt = false;
        //Remove randomness
        let getDamageBackup =  this.state.getDamage;
        this.state.getDamage = function(pokemon, target, move, suppressMessages){
            //The first part of this method is taken from the original getDamage
            if (typeof move === 'string') {
                move = this.getActiveMove(move);
            } else if (typeof move === 'number') {
                // @ts-ignore
                move = /** @type {ActiveMove} */ ({
                    basePower: move,
                    type: '???',
                    category: 'Physical',
                    willCrit: false,
                    flags: {},
                });
            }
    
            // Let's see if the target is immune to the move.
            if (!move.ignoreImmunity || (move.ignoreImmunity !== true && !move.ignoreImmunity[move.type])) {
                if (!target.runImmunity(move.type, true)) {
                    return false;
                }
            }
    
            // Is it an OHKO move?
            if (move.ohko) {
                return target.maxhp;
            }
    
            // If there's a fix move damage, we return that.
            if (move.damage) {
                return move.damage;
            }
    
            // If it's the first hit on a Normal-type partially trap move, it hits Ghosts anyways but damage is 0.
            if (move.volatileStatus === 'partiallytrapped' && move.type === 'Normal' && target.hasType('Ghost')) {
                return 0;
            }
    
            // Let's check if we are in middle of a partial trap sequence to return the previous damage.
            if (pokemon.volatiles['partialtrappinglock'] && (target === pokemon.volatiles['partialtrappinglock'].locked)) {
                return pokemon.volatiles['partialtrappinglock'].damage;
            }

            let basePower = move.basePower;
            if (move.basePowerCallback) {
                basePower = move.basePowerCallback.call(this, pokemon, target, move);
            }
            if (!basePower) {
                return basePower === 0 ? undefined : basePower;
            }

            //This was all non-random stuff. If the damage is calculated normally (with random variables), we look a few lines ahead
            //to read the damage and return it.
            while(followingLines.length){
                let line = followingLines[0];
                followingLines = followingLines.slice(1);
                let tokens = line.split('|');
                
                if(tokens[1] === "move") return false;
                if(tokens[1] !== "-damage")
                    continue;
                
                //Code from updatePokemonOnDamage
                let tokens2 = tokens[2].split(': ');
                let player = tokens2[0];
                let pokeName = tokens2[1];
                let tokens3 = tokens[3].split(/\/| /);       
                let health = tokens3[0];
                let maxHealth = tokens3[1];
                let battleside = undefined;

                if(self.isPlayer(player)) {
                    battleside = self.state.p1;
                } else {
                    battleside = self.state.p2;
                }

                let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
                if(!pokemon) {
                    //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
                    return;
                }

                if(health == 0){
                    return pokemon.hp;
                } 
                let newHP = Math.ceil(health / maxHealth * pokemon.maxhp);
                damageDealt = true
                return pokemon.hp - newHP;
            }
            return false;
        };

        let followingLinesCopy = clone(followingLines);
        let sampleBackup = this.state.sample;
        this.state.sample = function(items){
            if(items[0] && items[0].volatiles) return sampleBackup.bind(this)(items);

            while(followingLinesCopy.length){
                let line = followingLinesCopy[0];
                followingLinesCopy = followingLinesCopy.slice(1);
                if(line.startsWith("|-start|")){
                    let tokens = line.split("|");
                    let moveName = tokens[4];
                    return this.getMove(moveName).id;
                } else if( line.startsWith("|-hitcount|")){
                    let tokens = line.split("|");
                    return parseInt(tokens[3]);
                }
            }
        }

        let secondaryBackup = moveObj.secondary;
        moveObj.secondary = undefined;
        let secondariesBackup = moveObj.secondaries;
        if(moveObj.secondaries) moveObj.secondaries = moveObj.secondaries.map(secondary => {
            secondary.chance = 0;
            return secondary;
        });
        let accuracyBackup = moveObj.accuracy;
        moveObj.accuracy = miss ? 0 : true;

        let statusBackup = pokemon.status;
        pokemon.status = "";
        let confusionBackup = pokemon.volatiles.confusion;
        if(confusionBackup) delete pokemon.volatiles.confusion;

        //if(["mimic"].includes(moveObj.id)) debugger;
        try{
            this.state.runMove(moveObj, pokemon, target, source);
        } catch(e){
            debugger;
            throw e;
        }

        this.state.getDamage = getDamageBackup;
        this.state.sample = sampleBackup;
        moveObj.secondary = secondaryBackup;
        moveObj.secondaries = secondariesBackup;
        moveObj.accuracy = accuracyBackup;

        pokemon.status = statusBackup;
        if(confusionBackup) pokemon.volatiles.confusion = confusionBackup;

        if(damageDealt) pokemon.removeVolatile("twoturnmove")
    }

    updatePokemonOnCant(tokens) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let battleside = undefined;
        let reason = tokens[3];

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            return;
        }

        switch(reason){
            case "slp":
                //logger.info("Update sleep turn ")
                //logger.info(pokemon.moveThisTurn ? "moveThisTurn" : "notMoveThisTurn")
                if(pokemon.statusData.id !== "slp") throw new Error("Wrong status problem: " + pokemon.statusData.id)
                while(pokemon.statusData.time <= 1){
                    //logger.info("earlier startTime was too short: " + pokemon.statusData.startTime)
                    let newStartTime = this.state.random(1, 8);
                    pokemon.statusData.time += newStartTime - pokemon.statusData.startTime;
                    pokemon.statusData.startTime = newStartTime;
                }
                this.state.runEvent('BeforeMove', pokemon);
                break;

            case "par":
                //Code taken from servercode/data/mode/gen1/status.js , Method par.onBeforeMove()
				pokemon.removeVolatile('bide');
				pokemon.removeVolatile('twoturnmove');
				pokemon.removeVolatile('fly');
				pokemon.removeVolatile('dig');
				pokemon.removeVolatile('solarbeam');
				pokemon.removeVolatile('skullbash');
                pokemon.removeVolatile('partialtrappinglock');
                break;

            case "partiallytrapped":
                log.info("Can't because of PartiallyTrapped. " + tokens.join("|"))
                //TODO
                break;

            case "recharge":
            this.state.runMove("recharge", pokemon)
            break;
            
            case "frz":
                pokemon.lastMove = null;
                break;

            default:
                throw new Error("Unexpected Cant-Reason: " + reason);
        }

    }

    updatePokemonOnFaint(tokens) {
        //logger.info("UpdatePokemonOnFaint")
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        pokemon.faint();
        this.state.faintMessages();
        this.state.checkFainted();
        //logger.info("Is fainted Pokemon forced to switch? " + pokemon.switchFlag)
        pokemon.faintMarkerFromBattleRoom = true;

        this.updatePokemon(battleside, pokemon);
    }

    updatePokemonOnDamage(tokens) {
        //extract damage dealt to a particular pokemon
        //also takes into account passives
        //note that opponent health is recorded as percent. Keep this in mind
        // TODO: Use damage to infer about the opponents stats / items 

        //logger.info("UpdatePokemonOnDamage")
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let tokens3 = tokens[3].split(/\/| /);       
        let health = tokens3[0];
        let maxHealth = tokens3[1];
        if(maxHealth === "fnt") maxHealth = 100;
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        let newHP = Math.ceil(health / maxHealth * pokemon.maxhp);

        //update hp
        pokemon.hp = newHP;
        if(isNaN(newHP)) debugger;
        this.updatePokemon(battleside, pokemon);

        if(tokens3[2]) this.updatePokemonStatus([tokens[0], tokens[1], tokens[2], tokens3[2]], true);
    }

    updatePokemonOnBoost(tokens, isBoost) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let stat = tokens[3];
        let boostCount = parseInt(tokens[4]);
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        let overwriteBoosts = pokemon.overwriteBoosts;
        if(!overwriteBoosts) overwriteBoosts = {
            accuracy: 0,
            atk: 0,
            def: 0,
            evasion: 0,
            spa: 0,
            spd: 0,
            spe: 0
        };

        if(isBoost) {
            overwriteBoosts[stat] += boostCount;
        } else {
            overwriteBoosts[stat] -= boostCount;
        }
        if (overwriteBoosts[stat] > 6) {
            overwriteBoosts[stat] = 6;
        }
        if (overwriteBoosts[stat] < -6) {
            overwriteBoosts[stat] = -6;
        }

        pokemon.boosts = overwriteBoosts;
        pokemon.overwriteBoosts = overwriteBoosts;

        if(this.state.gen === 1){
            pokemon.modifiedStats[stat] = pokemon.stats[stat];
            // @ts-ignore
            if (pokemon.boosts[stat] >= 0) {
                // @ts-ignore
                pokemon.modifyStat(stat, [1, 1.5, 2, 2.5, 3, 3.5, 4][pokemon.boosts[stat]]);
            } else {
                // @ts-ignore
                pokemon.modifyStat(stat, [100, 66, 50, 40, 33, 28, 25][-pokemon.boosts[stat]] / 100);
            }
        }
        this.updatePokemon(battleside, pokemon);
    }

    updatePokemonSetBoost(tokens) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let stat = tokens[3];
        let boostCount = parseInt(tokens[4]);
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        pokemon.boosts[stat] = boostCount;
        this.updatePokemon(battleside, pokemon);
    }

    updatePokemonRestoreBoost(tokens) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];        
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

        for(let stat in pokemon.boosts) {
            if(pokemon.boosts[stat] < 0)
                delete pokemon.boosts[stat];
        }
        this.updatePokemon(battleside, pokemon);
    }

    updatePokemonStart(tokens, newStatus) {
        //add condition such as leech seed, substitute, ability, confusion, encore
        //move: yawn, etc.
        //ability: flash fire, etc.

        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let status = tokens[3];
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            //logger.error("We have never seen " + pokeName + " before in this battle. Should not have happened.");
            return;
        }

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
    }

    updateField(tokens, newField) {
        //as far as I know, only applies to trick room, which is a pseudo-weather
        let fieldStatus = tokens[2].substring(6);
        if(newField) {
            this.state.addPseudoWeather(fieldStatus);
        } else {
            this.state.removePseudoWeather(fieldStatus);
        }
    }

    updateWeather(tokens) {
        let weather = tokens[2];
        if(weather === "none") {
            this.state.clearWeather();
        } else {
            this.state.setWeather(weather);
        }
    }

    updateSideCondition(tokens, newSide) {
        let player = tokens[2].split(' ')[0];
        let sideStatus = tokens[3];
        if(sideStatus.substring(0,4) === "move")
            sideStatus = tokens[3].substring(6);
        let battleside = undefined;
        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        if(newSide) {
            battleside.addSideCondition(sideStatus);
        } else {
            battleside.removeSideCondition(sideStatus);
        }
    }

    updatePokemonStatus(tokens, newStatus) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let status = tokens[3];
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }

        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);
        if(!pokemon) {
            return;
        }

        if(newStatus) {
            let success = pokemon.setStatus(status);

            if(this.state.gen === 1 && success){
                if (status === 'brn') {
                    pokemon.modifyStat('atk', 0.5);
                    pokemon.addVolatile('brnattackdrop');
                }
                // @ts-ignore
                if (status === 'par') {
                    pokemon.modifyStat('spe', 0.25);
                    pokemon.addVolatile('parspeeddrop');
                }
            }
        } else {
            //heal a Pokemon's status
            pokemon.clearStatus();
        }
        this.updatePokemon(battleside, pokemon);
    }

    updatePokemonOnItem(tokens, newItem) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let item = tokens[3];
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        
        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);

        if(newItem) {
            pokemon.setItem(item);
        } else {
            pokemon.clearItem(item);
        }
        this.updatePokemon(battleside, pokemon);
    }

    updatePokemonOnFormeChange(tokens) {
        let tokens2 = tokens[2].split(': ');
        let player = tokens2[0];
        let pokeName = tokens2[1];
        let tokens3 = tokens[3].split(', ');
        let newPokeName = tokens3[0];
        let battleside = undefined;

        if(this.isPlayer(player)) {
            battleside = this.state.p1;
        } else {
            battleside = this.state.p2;
        }
        //Note: crashes when the bot mega evolves.
        //logger.info(pokeName + " has transformed into " + newPokeName + "!");
        let pokemon = battleside.pokemon.find(poke => poke.name === pokeName);

        //apply forme change
        pokemon.formeChange(newPokeName);
        this.updatePokemon(battleside, pokemon);
    }
    
    updateSide(request) {

        let sideData = request.side
        if (!sideData || !sideData.id) return;
        //logger.info("Starting to update my side data.");
        
        // Update each pokemon
        for (let i = 0; i < sideData.pokemon.length; ++i) {
            let pokemon = sideData.pokemon[i];

            let details = pokemon.details.split(",");
            let name = details[0].trim();
            let nickname = pokemon.ident.split(": ")[1]
            let level = details[1] ? parseInt(details[1].trim().substring(1)) : 100;

            let template = {
                name: name,
                moves: pokemon.moves,
                level: level
            };

            //keep track of old pokemon
            let oldPokemon = this.state.p1.pokemon[i];

            if(oldPokemon) continue;
            //logger.info("Create new Pokemon in updateSide")

            if(this.state.gen <= 2)
                template.evs = {hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252};

            // Initialize pokemon
            this.state.p1.pokemon[i] = new BattlePokemon(template, this.state.p1);
            this.state.p1.pokemon[i].position = i;
            if(oldPokemon)
                this.state.p1.pokemon[i].trueMoves = oldPokemon.trueMoves;
            this.state.p1.pokemon[i].name = nickname

            // Update the pokemon object with latest stats
            for (let stat in pokemon.stats) {
                this.state.p1.pokemon[i].baseStats[stat] = pokemon.stats[stat];
            }

            // Update health/status effects, if any
            let condition = pokemon.condition.split(/\/| /);
            this.state.p1.pokemon[i].hp = parseInt(condition[0]);
            this.state.p1.pokemon[i].maxhp = parseInt(condition[1]);

            if(condition.length > 2 && !oldPokemon.statusData.id) {//add status condition
                this.state.p1.pokemon[i].setStatus(condition[2]); //necessary
            }
            if(oldPokemon && oldPokemon.isActive && oldPokemon.statusData && oldPokemon.statusData.id) { //keep old duration
                this.state.p1.pokemon[i].statusData = oldPokemon.statusData;
            }

            // Keep old boosts
            if(oldPokemon)
                this.state.p1.pokemon[i].boosts = oldPokemon.boosts;

            // Keep old volatiles
            if(oldPokemon)
                this.state.p1.pokemon[i].volatiles = oldPokemon.volatiles;

            if (pokemon.active) {
                this.state.p1.active = [this.state.p1.pokemon[i]];
                this.state.p1.pokemon[i].isActive = true;
            }

       }

        // Enforce that the active pokemon is in the first slot
        this.state.p1.pokemon = _.sortBy(this.state.p1.pokemon, function(pokemon) { return pokemon.isActive ? 0 : 1 });
        for(let i = 0; i < 6; i++){
            if(this.state.p1.pokemon[i]) this.state.p1.pokemon[i].position = i
        }

        this.side = sideData.id;
        this.oppSide = (this.side === "p1") ? "p2" : "p1";
    }
}

module.exports = Replicater;