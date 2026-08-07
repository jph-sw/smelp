import { EventEmitter } from "node:events";
import type { DomainEvent, DomainEventType } from "./types";

type Handler<E extends DomainEvent = DomainEvent> = (
	event: E,
) => void | Promise<void>;

class EventBus {
	private emitter = new EventEmitter();

	constructor() {
		this.emitter.setMaxListeners(50);
	}

	on<T extends DomainEventType>(
		type: T,
		handler: Handler<Extract<DomainEvent, { type: T }>>,
	) {
		this.emitter.on(type, handler);
	}

	onAny(handler: Handler) {
		this.emitter.on("*", handler);
	}

	emit(event: DomainEvent) {
		this.emitter.emit(event.type, event);
		this.emitter.emit("*", event);
	}
}

export const eventBus = new EventBus();
