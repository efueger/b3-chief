import stampit from 'stampit';
import _isString from 'lodash/isString';
import _isObject from 'lodash/isObject';
import _isFunction from 'lodash/isFunction';
import _values from 'lodash/values';
import invariant from 'invariant';

import { BehaviorTree } from './behavior3js/index.js';
import * as Decorators from './behavior3js/decorators';
import * as Composites from './behavior3js/composites';
import * as Actions from './behavior3js/actions';

import Uid from './core/Uid';
import Private from './core/Private';

const Behavior = stampit({
	initializers: [initializeNodeMap],
	methods: {
		registerBehaviorNode, createBehaviorNode, listBehaviorNodes,
		createBehaviorTree,
	},
}).compose(Uid);

const privates = Private.create();

function initializeNodeMap() {
	privates.init(this);
	privates.set(this, 'nodes', new Map());

	const standardNodes = _values(
		Object.assign({}, Decorators, Composites, Actions)
	);
	standardNodes.forEach(this.registerBehaviorNode, this);
}

function registerBehaviorNode(nodeClass) {
	invariant(_isFunction(nodeClass),
		'The registerNode() method has to be called with constructor function of node class.'
	);

	invariant(nodeClass.prototype && _isFunction(nodeClass.prototype.tick),
		'Node class passed to registerNode() is missing the mandatory tick method on its prototype.' + // eslint-disable-line max-len
		'Either use B3.Class(B3.BaseNode, {}) or define your own class with such method.'
	);

	const nodeName = nodeClass.prototype.name;

	invariant(_isString(nodeName) && nodeName.length,
		'Passed node class %s to registerNode() call needs to have a unique string name specified.', nodeClass  // eslint-disable-line max-len
	);

	const nodes = privates.get(this, 'nodes');

	invariant(!nodes.has(nodeName),
		'The name of node has to be unique. There is already node `%s` registered.', nodeName
	);

	nodes.set(nodeName, nodeClass);
}

function createBehaviorNode(nodeName, properties = null) {
	invariant(_isString(nodeName),
		'Called createBehaviorNode() without name of node to create.' +
		'Name is expected to be a non-empty string.'
	);

	const nodeClass = privates.get(this, 'nodes').get(nodeName);
	if (nodeClass === undefined) {
		return null;
	}

	const behaviorNode = Reflect.construct(nodeClass, []);
	behaviorNode.id = `${nodeName}-${this.createUid()}`;

	if (_isObject(properties) && _isObject(behaviorNode.properties)) {
		Object.assign(behaviorNode.properties, properties);
	}

	return behaviorNode;
}

function listBehaviorNodes() {
	return Array.from(privates.get(this, 'nodes').values()).map((behaviorNode) => ({
		name: behaviorNode.prototype.name,
		category: behaviorNode.prototype.category,
		parameters: behaviorNode.prototype.parameters,
	}));
}

function createBehaviorTree(id) {
	const behaviorTree = new BehaviorTree();
	if (_isString(id) && id.length) {
		behaviorTree.id = id;
	}
	return behaviorTree;
}

export default Behavior;
