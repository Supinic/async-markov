const whitespaceRegex = /\s+/g;
const sentenceRegex = /[?!.]/;

type Word = string;
type Sentence = string;

type MappedNode = {
	mapped: true;
	sums: Record<string, Word>;
	total: number;
	related: Record<Word, number>;
}
type InvalidatedNode = {
	mapped: false;
	sums: Record<string, Word>;
	total: number;
	related: Record<Word, number>;
}
type Node = MappedNode | InvalidatedNode;

type Representation = {
	edges: number;
	words: [Word, Node][];
	hasSentences: boolean;
};

const isMappedNode = (node: Node): node is MappedNode => {
	return (node.mapped);
};

class AsyncMarkov {
	#nodes: Map<Word, Node> = new Map();
	#hasSentences = false;
	#edges = 0;

	add (string: string): this {
		if (!this.#hasSentences) {
			this.#hasSentences = sentenceRegex.test(string);
		}

		const data = string
			.trim()
			.replace(whitespaceRegex, " ")
			.split(" ")
			.filter(Boolean);

		const length = data.length;
		if (length < 2) {
			return this;
		}

		for (let i = 1; i < length; i++) {
			const first = data[i - 1];
			const second = data[i];

			if (!this.#nodes.has(first)) {
				const initNode: InvalidatedNode = {
					total: 0,
					mapped: false,
					sums: {},
					related: {}
				};

				this.#nodes.set(first, initNode);
			}

			const node = this.#nodes.get(first);
			if (!node) {
				return this; // Will never happen
			}

			if (typeof node.related[second] === "undefined") {
				node.related[second] = 0;
			}

			this.#edges++;
			node.total++;
			node.mapped = false;
			node.related[second]++;
		}

		return this;
	}

	generateWord (root: Word | null): Word | null {
		if (this.#nodes.size === 0) {
			throw new Error("Cannot generate words, this model has no processed data");
		}

		if (!root) {
			const keys = [...this.#nodes.keys()];
			const index = Math.trunc(Math.random() * keys.length);
			root = keys[index];
		}

		const object = this.#nodes.get(root);
		return (object)
			? AsyncMarkov.selectWeighted(object)
			: null;
	}

	generateWords (amount: number, root: Word | null = null, options: { stop?: boolean } = {}): Sentence {
		if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
			throw new Error("Input amount must be a positive finite integer");
		}

		let current = root;
		const output = [];
		if (current) {
			output.push(current);
		}

		const stop = Boolean(options.stop);
		while (amount--) {
			current = this.generateWord(current);
			if (!current) {
				if (stop) {
					break;
				}
				else {
					current = this.generateWord(null);
				}
			}

			output.push(current);
		}

		return output.join(" ");
	}

	generateSentences (amount: number, root: Word | null = null): string {
		if (!this.#hasSentences) {
			throw new Error("Model data does not contain delimiters - sentences cannot be generated");
		}
		else if (amount <= 0 || Math.trunc(amount) !== amount || !Number.isFinite(amount)) {
			throw new Error("Amount of sentences must be a positive finite integer");
		}

		let current = root;
		const output = [];
		if (current) {
			output.push(current);
		}

		while (amount > 0) {
			current = this.generateWord(current);
			output.push(current);

			if (current && sentenceRegex.test(current)) {
				amount--;
			}
		}

		return output.join(" ");
	}

	finalize (): void {
		for (const node of this.#nodes.values()) {
			AsyncMarkov.calculateWeights(node);
		}
	}

	has (word: Word): boolean {
		return this.#nodes.has(word);
	}

	toJSON (): Representation {
		this.finalize();
		return {
			edges: this.#edges,
			words: [...this.#nodes.entries()],
			hasSentences: this.#hasSentences
		};
	}

	load (input: string | Representation): this {
		const data = (typeof input === "string") ? JSON.parse(input) : input;

		this.reset();
		this.#hasSentences = data.hasSentences;
		this.#nodes = new Map(data.words);

		if (typeof data.edges === "number") {
			this.#edges = data.edges;
		}
		else {
			const iterator = this.#nodes.values();
			let it = iterator.next();

			while (!it.done) {
				this.#edges += it.value.total ?? 0;
				it = iterator.next();
			}
		}

		return this;
	}

	reset (): void {
		this.#nodes.clear();
	}

	get size (): number {
		return this.#nodes.size;
	}

	get keys (): string[] {
		return [...this.#nodes.keys()];
	}

	get edges (): number {
		return this.#edges;
	}

	static create (input: string | Representation): AsyncMarkov {
		const instance = new AsyncMarkov();
		instance.load(input);

		return instance;
	}

	static selectWeighted (object: Node): Word | null {
		const node: MappedNode = (!isMappedNode(object))
			? AsyncMarkov.calculateWeights(object)
			: object;

		const roll = Math.trunc(Math.random() * node.total);
		const keys = Object.keys(node.sums);
		for (let i = 0; i < keys.length; i++) {
			const pick = Number(keys[i]);
			if (roll < pick) {
				return node.sums[pick];
			}
		}

		return null;
	}

	static calculateWeights (node: Node, force: boolean = false): MappedNode {
		if (isMappedNode(node) && !force) {
			return node;
		}

		let total = 0;
		const keys = Object.keys(node.related);
		const length = keys.length;
		for (let i = 0; i < length; i++) {
			const key = keys[i];
			const value = node.related[key];

			total += value;
			node.sums[total] = key;
		}

		node.mapped = true;
		return node as MappedNode;
	}
}

export = AsyncMarkov;
