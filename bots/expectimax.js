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
var minimaxbot = require("./minimaxbot");

var clone = require("./../clone");

// ---- MCTS ALGORITHM
// ------------------------------------------------------------

// Reduced gamestate representation
class State {
    constructor(battle) {
        var sides =  [battle.p1, battle.p2]
        var active = _.map(sides, function(s){
            return _.find(s.pokemon, function(p){return p.position === 0})
        })

        this.names = _.map(active, 'name')
        this.items = _.map(active, 'item')
        this.fnt = _.map(active, function(p){return p.hp == 0})
        this.statusData = _.map(active, 'statusData.id')
    }
}

class Node {
    
    /** Apply the move assigned to this node */
    constructor(parent, player, choices, depth, state) {
        var self = this
        this.parent = parent
        
        this.children = []
        
        this.depth = depth || 0

        this.q = 0

        this.choices = choices
        
        // Used to identify this child
        this.state = state
    }

    get_child(moves, choices, state) {
        var child = new Node(this, moves, 1 - player, choices, this.depth + 1, state)
        this.children.push(child)
        return child
    }
}

// ---- UTILS
// ------------------------------------------------------------

function product() {
  var args = Array.prototype.slice.call(arguments); // makes array from arguments
  return args.reduce(function tl (accumulator, value) {
    var tmp = [];
    accumulator.forEach(function (a0) {
      value.forEach(function (a1) {
        tmp.push(a0.concat(a1));
      });
    });
    return tmp;
  }, [[]]);
}

/** Sample from elements 'elems' according to function g which maps elements to un-normalized probabilities */
function sample_from(elems, g) {
    var cumulative = 0;
    var sum_pairs = _.map(elems, function(elem){
        cumulative += g(elem);
        return [cumulative, elem];
    });

    var rand = Math.random()*cumulative
    var result = _.find(sum_pairs, function(item){return item[0] >= rand})
    return result[1]
}

// ---- MCTS
// ------------------------------------------------------------

class Expectimax {
    /**
     * Creates an Expectimax search object. One of these will be constructed at
     * the start of each of the AI player's turns.
     * 
     * @constructor
     * @param {int} rounds - How many rounds to play at each chance node
     * @param {int} cutoff_depth - The depth at which to cut off simulation and perform heuristic evaluation
     * @param {int} player - The AI player, either 0 or 1 corresponding to p1 or p2.
     */    
    constructor(rounds, cutoff_depth, bot_player) {
        this.turn = 0

        this.rounds = rounds || 3
        this.cutoff_depth = cutoff_depth
        this.bot_player = bot_player
    }

    initTurn(game, p1_choices, p2_choices) {
        this.game = game

        var root_state = new State(game.battle)
        
        this.p1_choices = !!p1_choices ? p1_choices : game.getPossibleMoves(0)
        
        // The human player does not get to move if we've fainted, and they haven't
        if(root_state.fnt[0] && !root_state.fnt[1]) {
            p2_choices = []
        }
        this.p2_choices = !!p2_choices ? p2_choices : game.getPossibleMoves(1)
        
        this.turn++
    }

    selectMove() {
        return this.max_node(clone(this.game), 0)[0]
    }

    max_node(game, depth) {
        var self = this

        if (game.getWinner() !== undefined || depth == this.cutoff_depth) {
            return[null, game.heuristic()]
        }

        var choices = (depth === 0 && !!this.p1_choices) ? this.p1_choices : game.getPossibleMoves(0)

        var reward_map = _.map(choices, function(c) {
            return [c, self.min_node(game, depth, c)[1]]
        })
        var max = _.maxBy(reward_map, function(rw){return rw[1]})
        if(!max) {console.log(JSON.stringify(reward_map))}
        return max
    }
    
    min_node(game, depth, max_choice) {
        var self = this

        var choices = (depth === 0 && !!this.p2_choices) ? this.p2_choices : game.getPossibleMoves(1)        
        
        var reward_map = _.map(choices, function(c) {
            return [c, self.chance_node(game, depth, [max_choice, c])]
        })
        var min = _.minBy(reward_map, function(rw){return rw[1]})
        if(!min) {
            console.log(JSON.stringify(reward_map) + " " + JSON.stringify(choices))
            return [undefined, this.chance_node(game, depth, [max_choice, undefined])]
        }
        return min
    }

    chance_node(game, depth, moves) {
        var self = this

        return _.sum(_.times(this.rounds, function(round) {
            var new_game = clone(game)
            new_game.performTurn(moves)
            return self.max_node(new_game, depth+1)[1]
        })) / this.rounds
    }

    /** Determinize a battleside using the probabilities in the set */
    determinize(battleside) {

        _.each(battleside.pokemon, function(pokemon) {
            if(!!pokemon.set.probabilities) {
                var set = pokemon.set

                set.item = sample_from(set.probabilities.items, function(e){return e[1]})[0]
                set.evs = _.sample(set.probabilities.evs)
                //set.moves = pokemon.trueMoves + _.map(_.sampleSize(set.probabilities.moves, 4-pokemon.trueMoves.length), function(m){return m[0]})

                // Create the new pokemon
                var new_pokemon = new BattlePokemon(set, battleside);
                new_pokemon.trueMoves = pokemon.trueMoves
                new_pokemon.nickname = pokemon.nickname
                pokemon.position = pokemon.position;
                battleside.pokemon[pokemon.position] = new_pokemon;

                if (pokemon.position === 0) {
                    battleside.active = [new_pokemon];
                    new_pokemon.isActive = true;
                }
            }
        })
    

        battleside.pokemon = _.sortBy(battleside.pokemon, function(pokemon) { return pokemon.isActive ? 0 : 1 });
        for(var i = 0; i < 6; i++) {
            battleside.pokemon[i].position = i
        }
    }
}

// ---- POKEMON GAME
// ------------------------------------------------------------

function PokemonBattle(battle) {
    this.battle = battle;
    this.battle.start();
}

PokemonBattle.prototype.getPossibleMoves = function (player) {
    var current_player = player === 0 ? this.battle.p1 : this.battle.p2;
    if (current_player.request.wait)
    {
        return []
    }
    var choices = BattleRoom.parseRequest(current_player.request).choices.sort();
    return choices
};

PokemonBattle.prototype.performTurn = function (actions) {
    if(actions[0] !== undefined)
    {
        this.battle.choose('p1', BattleRoom.toChoiceString(actions[0], this.battle.p1), this.battle.rqid);
    }
    else
    {
        this.battle.p1.decision = true;
    }

    if(actions[1] !== undefined)
    {
        this.battle.choose('p2', BattleRoom.toChoiceString(actions[1], this.battle.p2), this.battle.rqid);
    }
    else
    {
        this.battle.p2.decision = true;
    }
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

// Function that decides which move to perform
var overallMinNode = {};
var lastMove = '';
var expectimax = new Expectimax(4, 1, 0)
var decide = module.exports.decide = function (battle, choices, has_p2_moved) {
    var startTime = new Date();

    log.info("Starting move selection");
    log.info("Given choices: " + JSON.stringify(choices));
    log.info("Has P2 moved? " + has_p2_moved);

    expectimax.initTurn(new PokemonBattle(battle), choices, !!has_p2_moved ? [] : null)
    var action = expectimax.selectMove();
    if (action === undefined) {
        action = randombot.decide(battle, choices);
        log.info("Randomly selected action");
    }
    
    log.info("My action: " + action.type + " " + action.id);
    lastMove = action.id;
    var endTime = new Date();

    log.info("Decision took: " + (endTime - startTime) / 1000 + " seconds");
    return {
        type: action.type,
        id: action.id
    };
}