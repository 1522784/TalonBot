var _ = require('lodash');
var nnClient = require("./nnClient");
var BattleRoom = require("./../../battleroom");
var cloneBattleState = require("../../clone/cloneBattleState");

function PokemonBattle(battle) {
    this.battle = battle;

    let firstMinusIndex = battle.id.indexOf("-")
    let secoundMinusIndex = battle.id.indexOf("-", firstMinusIndex + 1);
    let format = battle.id.slice(firstMinusIndex + 1, secoundMinusIndex);
    this.nnClient = nnClient.getClient(format);

    this.player = 0;
    this.choices = [];
}

PokemonBattle.prototype.getPossibleMoves = function () {
    //Weird bug: Sometimes the method binds to the node object that calls this method binded to its property game
    //No idea why that happens, but here's a workaround:
    let self = this.game ? this.game : this;

    if(self.getWinner() !== undefined) return undefined;

    var current_player = self.player === 0 ? self.battle.p1 : self.battle.p2;

    if (current_player.request.wait)
    {
        return [{decision: null, probability: 1},]
    }

    return this.nnClient.getRequestOptions(self.battle, current_player.id);
};

PokemonBattle.prototype.destroy = function () {
    this.battle.destroy();
};

PokemonBattle.prototype.getCurrentPlayer = function () {
    return this.player;
};

PokemonBattle.prototype.performMove = function (action) {
    var player_string = this.player === 0 ? 'p1' : 'p2'
    var player_side = this.player === 0 ? this.battle.p1 : this.battle.p2

    if(action) this.choices.push({player: player_string, choiceString: BattleRoom.toChoiceString(action, player_side)});
    //let choiceSuccess = this.battle.choose(player_string, BattleRoom.toChoiceString(action, player_side), this.battle.rqid);

    this.player = 1 - this.player;
};

PokemonBattle.prototype.isReadyForPlay = function(){
    let numberOfActionsRequired = 0;
    if (!this.battle.p1.request.wait) numberOfActionsRequired++;
    if (!this.battle.p2.request.wait) numberOfActionsRequired++;
    return this.choices.length >= numberOfActionsRequired 
}

PokemonBattle.prototype.playTurn = function(copyNeeded){
    if(copyNeeded) this.battle = cloneBattleState(this.battle)

    while(this.choices.length){
        let choice = this.choices.pop()
        if(!choice.choiceString) choice.choiceString = "";
        let choiceSuccess = this.battle.choose(choice.player, choice.choiceString);

        if(!choiceSuccess){
            debugger;
            this.battle[choice.player].clearChoice();
            this.battle.makeRequest();
            this.nnClient.getRequestOptions(this.battle, choice.player);
            this.battle.choose(choice.player, choice.choiceString, this.battle.rqid);
    
            throw new Error(this.battle[choice.player].choice.error);
        }
    }

    this.player = 0;
}

// Check for a winner
PokemonBattle.prototype.getWinner = function () {
    var playerAlive = _.some(this.battle.p1.pokemon, function (pokemon) { return pokemon.hp > 0; });
    var opponentAlive = _.some(this.battle.p2.pokemon, function (pokemon) { return pokemon.hp > 0; }) || this.battle.p2.pokemon.length < 6;
    if (!playerAlive || !opponentAlive) {
        return playerAlive ? 0 : 1;
    }
    return undefined;
};


PokemonBattle.prototype.heuristic = function () {
    if (this.getWinner() !== undefined){
        return this.getWinner() === 0 ? 1000 : -1000;
    }

    let nnHeuristic = this.nnClient.evaluate(this.battle)

    /*let numTries = 0;
    let err = undefined;
    let maxTurns = 150;
    while(numTries < 5){
        try{
            this.battle = cloneBattleState(this.battle);
            while(this.getWinner() === undefined){
                if(this.battle.p1.pokemon.length > 6 || this.battle.p2.pokemon.length > 6) debugger;
                while(!this.isReadyForPlay()){
                    this.performMove(this.nnClient.randomChoice(this.getPossibleMoves()).decision)
                }
                this.playTurn(false)
                if(this.battle.turn >= maxTurns) throw new Error("Max turns reached")
            }
            return this.getWinner() === 0 ? 1000 : -1000;
        } catch(e){
            debugger;
            err = e;
            numTries++;
        }
    }
    throw err;*/

    // Aidan's Heuristic
    var p1_health = _.sum(_.map(this.battle.p1.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    
    console.log("HPHeuristic: " + ((p1_health - p2_health) / 600) + "\nNNHeuristic: " + nnHeuristic);
    return p1_health - p2_health;
    
    // Use minimax heuristic
    //return minimaxbot.eval(this.battle);
}

module.exports = PokemonBattle;