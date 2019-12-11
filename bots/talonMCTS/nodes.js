var _ = require('lodash');

var cloneBattleState = require("../../clone/cloneBattleState");
var clone = require("../../clone/clone");

var randomChoice = require("../../util/random");
var PokemonBattle = require("./battleWrapper");
var requests = require("./../../util/requests");

class Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts, maxChildren) {
        var self = this
        this.game = game
        this.mcts = mcts
        this.parent = parent
        this.move = move
        this.children = []
        this.maxChildren = maxChildren;
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0 

        // Perform the move
        if(move !== null)
        {
            this.game.performMove(this.move);
            if(this.game.isReadyForPlay()) this.game.playTurn(true);
        }

        // Moves for the current player
        this.untried_actions = this.game.getPossibleMoves(this.game.player);
        //if(this.depth === 2) log.info(this.untried_actions);
    }

    /** Get UCB1 upper bound on the utility of this node. */
    get_UCB1() {
        return this.q + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    get_child(move) {
        var gameclone = new PokemonBattle(this.game.battle);
        gameclone.player = this.game.player;
        gameclone.choices = clone(this.game.choices);
        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        try{
            var child = new Node(gameclone, this, move, this.depth + 1, this.mcts)
        }
        catch(e){
            var player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2
            throw new Error("Creating a new Child caused an error.\nParent depth: " + this.depth + "\nDecisionlog: " + this.getDecisionLog() + "\nOptions" + this.untried_actions.concat({decision: move}).map(option => option.decision.action + " " + option.decision.id) + "\nRequest: " + JSON.stringify(player_side.request) + "\nCaused by Error: " + e.stack)
        }
        this.children.push(child);
        return child;
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        if(!Array.isArray(this.untried_actions)) throw new Error;
        var action = randomChoice(this.untried_actions).decision;
        if (action === undefined) {
            return undefined
        }
        return this.get_child(action);
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.game.getWinner() !== undefined || this.children.size < this.maxChildren;
    }

    get_winner() {
        return this.game.getWinner()
    }

    destroy(){
        this.game.destroy();
        for(let child of this.children)
            child.destroy();
    }

    getDecisionLog(){
        let decisionLog = "";
        if(this.parent) decisionLog = this.parent.getDecisionLog();

        if(!this.move) return decisionLog;

        if(decisionLog.length) decisionLog += " --> ";
        
        let player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2;
        decisionLog += requests.toChoiceString(this.move, player_side);

        return decisionLog
    }
}

class BeforeTeamSelectedNode extends Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts, teamSimulator, maxChildren) {
        super(game,parent,move,depth,mcts, maxChildren);
        this.teamSimulator = teamSimulator;
        this.untried_actions = _(this.teamSimulator.getPossibleTeams()).castArray();
    }

    get_child(simulatedTeam) {
        var gameclone = new PokemonBattle(cloneBattleState(this.game.battle));
        simulatedTeam.completeBattle(gameclone.battle);
        gameclone.player = this.game.player;
        gameclone.choices = clone(this.game.choices);

        var child = new Node(gameclone, this, null, this.depth + 1, this.mcts, this.maxChildren)

        this.children.push(child);
        return child;
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var oppTeam = this.teamSimulator.getRandomTeam();
        return this.get_child(oppTeam);
    }

}

class CurrentChoiceNode extends Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts, teamSimulator, maxChildren) {
        super(game,parent,move,depth,mcts, maxChildren);
        this.teamSimulator = teamSimulator;
    }

    get_child(move) {
        var gameclone = new PokemonBattle(this.game.battle);
        gameclone.player = this.game.player;
        gameclone.choices = clone(this.game.choices);

        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        try{
            var child = new BeforeTeamSelectedNode(gameclone, this, move, this.depth + 1, this.mcts, this.teamSimulator, this.maxChildren);
        }
        catch(e){
            var player_side = this.game.player === 0 ? this.game.battle.p1 : this.game.battle.p2
            throw new Error("Creating a new Child caused an error.\nParent depth: " + this.depth + "\nDecisionlog: " + this.getDecisionLog() + "\nRequest: " + JSON.stringify(player_side.request) + "\nCaused by Error: " + e.stack)
        }
        this.children.push(child);
        return child;
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var action = this.untried_actions.sample();
        if (action === undefined) {
            return undefined
        }
        this.untried_actions = this.untried_actions.differenceBy([action])
        return this.get_child(action)
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.game.getWinner() !== undefined || this.untried_actions.size() === 0;
    }

}

module.exports = {
    Node,
    BeforeTeamSelectedNode,
    CurrentChoiceNode
}