import test from 'ava'

import './_chief'

import { ExecutionContext, ExecutionTick } from '../src/types'

test.beforeEach((t) => {
	const { instance, Chief } = t.context

	let counter = 0

	const behaviors = {}
	instance.getBehavior = (behaviorId) => (
		behaviors[behaviorId] || instance.getNativeBehavior(behaviorId)
	)

	t.context.createBehaviorNode = (tree, compilation = {}, type) => {
		const correctCompilation = {
			tick: ({ status }) => status.SUCCESS,
			...compilation,
		}
		const behavior = instance.createBehavior(`Test${counter += 1}`, type)
		behavior.getCompilation = () => correctCompilation
		behaviors[behavior.getId()] = behavior
		const node = tree.createNode(behavior.getId())
		return node
	}

	t.context.createNativeBehaviorNode = (tree, name) => tree.createNode(`Native-${name}`)

	t.context.createTreeWithRoot = (compilation, type) => {
		const tree = instance.createTree(`Tree #${counter += 1}`)
		const subject = instance.createSubject(tree)
		const node = t.context.createBehaviorNode(tree, compilation, type)
		tree.setRootNode(node)
		return { tree, subject, node }
	}
	t.context.execution = instance.planExecution()
	t.context.status = Chief.STATUS
})

test('execution() returns ERROR status if subject has invalid tree', (t) => {
	const { instance, execution, status } = t.context

	const subject = instance.createSubject('TestTree')
	instance.destroyTree('TestTree')
	const actual = execution(subject)
	t.is(actual, status.ERROR)
})

test('execution() returns ERROR status if tree has no root', (t) => {
	const { instance, execution, status } = t.context

	const subject = instance.createSubject('EmptyTree')
	const actual = execution(subject)
	t.is(actual, status.ERROR)
})

test('execution() returns state of root node execution of tick method', (t) => {
	const { execution, status, createTreeWithRoot } = t.context

	const { subject } = createTreeWithRoot({
		tick() {
			return status.SUCCESS
		},
	})

	const actual = execution(subject)
	t.is(actual, status.SUCCESS)
})

test('execution() provides execution context and tick object to tick behavior method', (t) => {
	const { execution, createTreeWithRoot } = t.context

	t.plan(1)
	const { subject } = createTreeWithRoot({
		tick(context, tick) {
			ExecutionContext(context)
			t.true(ExecutionTick.is(tick))
			return context.status.SUCCESS
		},
	})

	execution(subject)
})

test('the node with decorator behavior can execute its child and get its status', (t) => {
	const { execution, Chief, status, createTreeWithRoot, createNativeBehaviorNode } = t.context

	const { subject, tree, node } = createTreeWithRoot({
		tick(context, { child }) {
			return child()
		},
	}, Chief.BEHAVIOR_TYPE.DECORATOR)

	tree.addNodeChild(node, createNativeBehaviorNode(tree, 'Succeeder'))

	const actual = execution(subject)
	t.is(actual, status.SUCCESS)
})

test('the node with composite behavior can execute its children and get their status', (t) => {
	const { execution, Chief, status, createTreeWithRoot, createNativeBehaviorNode } = t.context

	const { subject, tree, node } = createTreeWithRoot({
		tick(context, { children }) {
			return children.reduce((result, child) => child(), null)
		},
	}, Chief.BEHAVIOR_TYPE.COMPOSITE)

	tree.addNodeChild(node, createNativeBehaviorNode(tree, 'Runner'))
	tree.addNodeChild(node, createNativeBehaviorNode(tree, 'Failer'))
	tree.addNodeChild(node, createNativeBehaviorNode(tree, 'Succeeder'))

	const actual = execution(subject)
	t.is(actual, status.SUCCESS)
})

test('lifecycle method onEnter is invoked whenever node is being executed', (t) => {
	const { execution, createTreeWithRoot } = t.context

	const { subject } = createTreeWithRoot({
		onEnter(context) {
			ExecutionContext(context)
			t.pass()
		},
	})

	t.plan(1)
	execution(subject)
})

test('runtime error in onEnter method is handled by error toolbox function', (t) => {
	const { instance, status, createTreeWithRoot } = t.context

	const expected = new Error('onEnter')

	const { subject } = createTreeWithRoot({
		onEnter() {
			throw expected
		},
	})

	const error = (actual) => {
		t.is(actual, expected)
		return status.ERROR
	}

	const execution = instance.planExecution((subj, toolbox) => (
		{ ...toolbox, error }
	))

	t.plan(2)
	t.is(execution(subject), status.ERROR)
})

test('lifecycle method onOpen is invoked only if node was closed previous tick', (t) => {
	const { execution, createTreeWithRoot } = t.context

	const { subject } = createTreeWithRoot({
		onOpen(context) {
			ExecutionContext(context)
			t.pass()
		},
		tick({ status }) {
			return status.RUNNING
		},
	})

	t.plan(1)
	execution(subject)
	execution(subject)
})

test('runtime error in onOpen method is handled by error toolbox function', (t) => {
	const { instance, status, createTreeWithRoot } = t.context

	const expected = new Error('onOpen')

	const { subject } = createTreeWithRoot({
		onOpen() {
			throw expected
		},
	})

	const onError = (actual) => {
		t.is(actual, expected)
		return status.ERROR
	}

	const execution = instance.planExecution((subj, toolbox) => toolbox, onError)

	t.plan(2)
	t.is(execution(subject), status.ERROR)
})

test('runtime error in onOpen still causes invocation of onExit method ', (t) => {
	const { execution, createTreeWithRoot } = t.context

	const { subject } = createTreeWithRoot({
		onOpen() {
			throw new Error()
		},
		onExit() {
			t.pass()
		},
	})

	t.plan(1)
	execution(subject)
})

test('runtime error in tick method is handled by error toolbox function', (t) => {
	const { instance, status, createTreeWithRoot } = t.context

	const expected = new Error('tick')

	const { subject } = createTreeWithRoot({
		tick() {
			throw expected
		},
	})

	const onError = (actual) => {
		t.is(actual, expected)
		return status.ERROR
	}

	const execution = instance.planExecution((subj, toolbox) => toolbox, onError)

	t.plan(2)
	t.is(execution(subject), status.ERROR)
})

test('lifecycle method onClose is invoked only when tick status is not RUNNING', (t) => {
	const { execution, createTreeWithRoot } = t.context

	let ticked = false
	const { subject } = createTreeWithRoot({
		onClose(context) {
			ExecutionContext(context)
			t.pass()
		},
		onExit() {
			ticked = true
		},
		tick({ status }) {
			return ticked ? status.SUCCESS : status.RUNNING
		},
	})

	t.plan(1)
	execution(subject)
	execution(subject)
})

test('runtime error in onClose method is handled by error toolbox function', (t) => {
	const { instance, status, createTreeWithRoot } = t.context

	const expected = new Error('onClose')

	const { subject } = createTreeWithRoot({
		onClose() {
			throw expected
		},
	})

	const onError = (actual) => {
		t.is(actual, expected)
		return status.ERROR
	}

	const execution = instance.planExecution((subj, toolbox) => toolbox, onError)

	t.plan(2)
	t.is(execution(subject), status.ERROR)
})

test('lifecycle method onExit is invoked always without need for specific status', (t) => {
	const { execution, createTreeWithRoot } = t.context

	const { subject } = createTreeWithRoot({
		onExit() {
			t.pass()
		},
		tick({ status }) {
			return status.RUNNING
		},
	})

	t.plan(1)
	execution(subject)
})

test('runtime error in onExit method is handled by error toolbox function', (t) => {
	const { instance, status, createTreeWithRoot } = t.context

	const expected = new Error('onExit')

	const { subject } = createTreeWithRoot({
		onExit() {
			throw expected
		},
	})

	const onError = (actual) => {
		t.is(actual, expected)
		return status.ERROR
	}

	const execution = instance.planExecution((subj, toolbox) => toolbox, onError)

	t.plan(2)
	t.is(execution(subject), status.ERROR)
})

test('lifecycle methods are executed in correct order', (t) => {
	const { execution, createTreeWithRoot } = t.context

	let stage = 0
	const { subject } = createTreeWithRoot({
		onEnter() {
			t.is(stage, 0)
			stage = 1
		},
		onOpen() {
			t.is(stage, 1)
			stage = 2
		},
		tick({ status }) {
			t.is(stage, 2)
			stage = 3
			return status.SUCCESS
		},
		onClose() {
			t.is(stage, 3)
			stage = 4
		},
		onExit() {
			t.is(stage, 4)
			stage = 5
		},
	})

	execution(subject)
	t.is(stage, 5)
})

test('resulting status is the ERROR if invalid status was returned from node tick', (t) => {
	const { execution, Chief, status, createTreeWithRoot, createBehaviorNode } = t.context

	const { subject, tree, node } = createTreeWithRoot({
		tick(context, { child }) {
			return child()
		},
	}, Chief.BEHAVIOR_TYPE.DECORATOR)

	tree.addNodeChild(node, createBehaviorNode(tree, {
		tick() {
			return 'INVALID'
		},
	}))

	const expected = status.ERROR
	const actual = execution(subject)
	t.is(actual, expected)
})

test('planExecution() accepts factory function to provide tools added to context for a given subject', (t) => {
	const { instance, Chief, createTreeWithRoot, createBehaviorNode } = t.context

	const { subject, tree, node } = createTreeWithRoot({
		tick(context, { child }) {
			t.true(context.expected)
			return child()
		},
	}, Chief.BEHAVIOR_TYPE.DECORATOR)

	tree.addNodeChild(node, createBehaviorNode(tree, {
		tick({ status, expected }) {
			t.true(expected)
			return status.SUCCESS
		},
	}))

	const execution = instance.planExecution((subj, toolbox) => (
		{ ...toolbox, expected: true }
	))

	t.plan(2)
	execution(subject)
})
