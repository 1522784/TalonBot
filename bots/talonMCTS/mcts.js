var {Node, CurrentChoiceNode, BeforeTeamSelectedNode} = require("./nodes");
var _ = require('lodash');
var log = require('log4js').getLogger("mcts");

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
    constructor(game, rounds, player, choices, teamSimulator) {
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
        this.rootNode = new CurrentChoiceNode(game, null, null, 0, this, teamSimulator, 60)
        if (choices)
        {
            this.rootNode.untried_actions = _(choices).castArray();
        }
    }

    destroy(){
        this.rootNode.destroy();
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
            var maxDepth = 3;
            if(this.game.battle.currentRequest === "switch" && !this.game.battle.p1.request.wait) maxDepth++;
            if(this.game.battle.currentRequest === "switch" && !this.game.battle.p2.request.wait) maxDepth++;
            while (node !== undefined && node.depth < maxDepth && !node.expanded()) {
                node = node.expand()
            }

            // Something went wrong, bail
            if (node === undefined)
            {
                continue
            }

            // Get the score of the node
            let reward = node.game.heuristic()
            log.info(node.getDecisionLog(true) + " heuristic: " + reward);

            // Roll back up incrementing the visit counts and propagating score
            while (node) {
                node.visits++;
                node.q = ((node.visits - 1)/node.visits) * node.q + 1/node.visits * reward;
                node = node.parent;
            }
        }

        /*if (this.rootNode.children.length > 0)
        {
            var action_string = JSON.stringify(_.map(this.rootNode.children, function(n){return [n.move, n.q, n.visits]}))
            log.info("Action scores: " + action_string);
        }
        else
        {
            log.info("No children");
        }*/
        
        if(!_(this.rootNode.children).maxBy('q')) debugger;
        // Get the move with the highest visit count
        return _(this.rootNode.children).maxBy('q').move
    }

    /** Gets the next node to be expanded.
     * recurses down to the next unexpanded node or terminal state */
    get_next_node(node) {
        while(node.get_winner() === undefined) {
            if (node.expanded()) {
                node = this.best_child(node)
            }
            else {
                return node;
            }
        }
        return node;
    } 

    /** Select a move according to the tree policy. */
    best_child(node) {
        if(node === this.rootNode) return _(node.children).sample();
        return _(node.children).maxBy(this.tree_policy)
    }
}

module.exports = MCTS;