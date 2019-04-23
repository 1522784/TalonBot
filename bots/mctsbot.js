'use strict'

// Logging
var log4js = require('log4js');
var log = require('log4js').getLogger("mcts");
var learnlog = require('log4js').getLogger("learning");

var program = require('commander'); // Program settings
var fs = require('fs');

var _ = require('lodash');
var BattleRoom = require("./../battleroom");

var randombot = require("./randombot");
var greedybot = require("./greedybot");
var minimaxbot = require("./minimaxbot");

var clone = require("./../clone");

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = '';
var decide = module.exports.decide = function (battle, choices) {
    var startTime = new Date();

    log.info("Starting move selection");

    var mcts = new MCTS(new PokemonBattle(battle), 150, 0, choices);
    var action = mcts.selectMove();
    if (action === undefined) {
        action = randombot.decide(battle, choices);
        log.info("Randomly selected action");
    }
    
    log.info("Given choices: " + JSON.stringify(choices));
    log.info("My action: " + action.type + " " + action.id);
    lastMove = action.id;
    var endTime = new Date();

    log.info("Decision took: " + (endTime - startTime) / 1000 + " seconds");
    return {
        type: action.type,
        id: action.id
    };
}

// ---- MCTS ALGORITHM
// ------------------------------------------------------------


class Node {
    
    /** Apply the move assigned to this node */
    constructor(game, parent, move, depth, mcts) {
        var self = this
        this.game = game
        this.mcts = mcts
        this.parent = parent
        this.move = move
        this.children = []
        
        this.depth = depth || 0

        this.q = 0
        this.visits = 0

        // Perform the move
        if(move !== null)
        {
            this.game.performMove(this.move)
        }

        // Moves for the current player
        this.untried_actions = _(this.game.getPossibleMoves(this.game.current_player)).castArray()
        if (depth === 0)
        {
            log.info("Root node choices: " + JSON.stringify(this.untried_actions));
        }
    }

    /** Get UCB1 upper bound on the utility of this node. */
    get_UCB1() {
        return this.q + Math.sqrt(2 * Math.log(this.parent.visits) / this.visits)
    }

    get_child(move) {
        var gameclone = clone(this.game);
        //_.assign(new this.game.constructor(), _.cloneDeep(this.game))
        var child = new Node(gameclone, this, move, this.depth + 1, this.mcts)
        this.children.push(child)
        return child
    }

    /** Expands a node with untried moves.
     * Select a random move from the set of untried actions. */
    expand() {
        var action = this.untried_actions.sample()
        if (action === undefined) {
            return undefined
        }
        this.untried_actions = this.untried_actions.differenceBy([action])
        return this.get_child(action)
    }

    /** Checks if all this node's actions have been tried */
    expanded() {
        return this.untried_actions.size() === 0
    }

    get_winner() {
        return this.game.getWinner()
    }
}

class MCTS {

    /**
     * Creates an MCTS search object. One of these will be constructed BattleRoom
     * the start of each of the AI player's turns.
     * TODO: Caching?
     * 
     * @constructor
     * @param {PokemonBattle} game - The game object containing all game-specific logic
     * @param {int} rounds - How many rounds to play out
     * @param {int} player - The AI player, either 0 or 1 corresponding to p1 or p2.
     * @param {Array} choices - Initial choices, handles fainted pokemon, etc...
     */    
    constructor(game, rounds, player, choices) {
        var self = this
        this.game = game

        // Specifies how nodes are explored
        this.c = 15.0       // Exploration constant
        this.tree_policy = function (node) {
            // We explore nodes by UCB1
            if (node.parent.game.getCurrentPlayer() === self.player) {
                return self.c*node.get_UCB1()
            }
            // Opposing player explores least explored node
            return -node.visits
        }

        this.rounds = rounds || 1000
        this.player = player

        // Create a new root node
        this.rootNode = new Node(game, null, null, 0, this)
        if (choices)
        {
            this.rootNode.untried_actions = _(choices).castArray()
        }
    }

    /** Select the move that should be performed by the player this turn */
    selectMove() {
        var round, node
        for (round = 0; round < this.rounds; round += 1) {

            // ---- MCTS Algorithm
            
            // Explore down to the bottom of the known tree via UCB1
            node = this.get_next_node(this.rootNode)

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }
            
            // Rollout to maximum depth k, or terminus
            var k = 6
            while (node !== undefined && node.depth < k && node.get_winner() === undefined) {
                node = node.expand()
            }

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }

            // Get the score of the node
            var winner = node.get_winner()
            var reward
            if (winner !== undefined)
            {
                reward = (this.player === node.get_winner()) ? Math.pow(10,7) : -Math.pow(10,7)
            }
            else {
                reward = node.game.heuristic()
            }

            // Roll back up incrementing the visit counts and propagating score
            while (node) {
                node.visits += 1
                node.q = ((node.visits - 1)/node.visits) * node.q + 1/node.visits * reward
                node = node.parent
            }
        }

        if (this.rootNode.children.length > 0)
        {
            var action_string = JSON.stringify(_.map(this.rootNode.children, function(n){return [n.move, n.q, n.visits]}))
            log.info("Action scores: " + action_string);
        }
        else
        {
            log.info("No children");
        }
        
        // Get the move with the highest visit count
        return _(this.rootNode.children).maxBy('visits').move
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node) {
        while(node.get_winner() === undefined) {
            if (node.expanded()) {
                node = this.best_child(node)
            }
            else {
                return node.expand()
            }
        }
        return node
    }

    /** Select a move according to the tree policy. */
    best_child(node) {
        return _(node.children).maxBy(this.tree_policy)
    }
}

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;
    this.battle.start();

    this.player = 0;
}

PokemonBattle.prototype.getPossibleMoves = function () {
    var current_player = this.player === 0 ? this.battle.p1 : this.battle.p2;
    if (current_player.request.wait)
    {
        return [null,]
    }
    var choices = BattleRoom.parseRequest(current_player.request).choices;
    return choices;
};

PokemonBattle.prototype.getCurrentPlayer = function () {
    return this.player;
};

PokemonBattle.prototype.performMove = function (action) {
    var player_string = this.player === 0 ? 'p1' : 'p2'
    var player_side = this.player === 0 ? this.battle.p1 : this.battle.p2

    if (this.player === 0) {
        this.battle.choose('p1', BattleRoom.toChoiceString(action, this.battle.p1), this.battle.rqid);
    }
    else if (this.player === 1) {
        this.battle.choose('p2', BattleRoom.toChoiceString(action, this.battle.p2), this.battle.rqid);
    }

    if(action !== undefined) {
        this.battle.choose(player_string, BattleRoom.toChoiceString(action, player_side), this.battle.rqid);
    }
    else {
        player_side.decision = true;
    }
    this.player = 1 - this.player;
};

// Check for a winner
PokemonBattle.prototype.getWinner = function () {
    var playerAlive = _.some(this.battle.p1.pokemon, function (pokemon) { return pokemon.hp > 0; });
    var opponentAlive = _.some(this.battle.p2.pokemon, function (pokemon) { return pokemon.hp > 0; });
    if (!playerAlive || !opponentAlive) {
        return playerAlive ? 0 : 1;
    }
    return undefined;
};


PokemonBattle.prototype.heuristic = function () {
    // Aidan's Heuristic
    var p1_health = _.sum(_.map(this.battle.p1.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    var p2_health = _.sum(_.map(this.battle.p2.pokemon, function (pokemon) {
        return !!pokemon.hp ? pokemon.hp / pokemon.maxhp * 100.0 : 0.0;
    }));
    
    return (p1_health - p2_health) + 600;
    
    // Use minimax heuristic
    //return minimaxbot.eval(this.battle);
}