import sortBy from 'lodash/sortBy'

class Event {
  constructor(data, { accessors, slotMetrics }) {
    const { start, startDate, end, endDate, top, height } =
      slotMetrics.getRange(accessors.start(data), accessors.end(data))

    this.start = start
    this.end = end
    this.startMs = +startDate
    this.endMs = +endDate
    this.top = top
    this.height = height
    this.data = data
  }

  // depth of tree
  get depth() {
    if (this.children) {
      return Math.max(...this.children.map((child) => child.depth)) + 1
    }
    return 1
  }

  /**
   * The event's width without any overlap.
   */
  get _width() {
    // The parent event's width is determined by depth of tree.
    const availableWidth =
      100 - (this.parent ? this.parent._width + this.parent.xOffset : 0)
    if (this.children) {
      return availableWidth / this.depth
    }
    return availableWidth
  }

  /**
   * The event's calculated width, possibly with extra width added for
   * overlapping effect.
   */
  get width() {
    const noOverlap = this._width
    const overlap = Math.min(100, noOverlap * 1.7)

    // parents can always grow.
    if (this.children) {
      return overlap
    }
    return noOverlap
  }

  get xOffset() {
    // parent overlap with + parent offset
    return this.parent ? this.parent._width + this.parent.xOffset : 0
  }
}

function sortByRender(events) {
  const sortedByTime = sortBy(events, ['startMs', (e) => -e.endMs])

  const sorted = []
  while (sortedByTime.length > 0) {
    const event = sortedByTime.shift()
    sorted.push(event)

    for (let i = 0; i < sortedByTime.length; i++) {
      const test = sortedByTime[i]

      // Still inside this event, look for next.
      if (event.endMs > test.startMs) continue

      // We've found the first event of the next event group.
      // If that event is not right next to our current event, we have to
      // move it here.
      if (i > 0) {
        const event = sortedByTime.splice(i, 1)[0]
        sorted.push(event)
      }

      // We've already found the next event group, so stop looking.
      break
    }
  }

  return sorted
}

export default function getStyledEvents({
  events,
  minimumStartDifference,
  slotMetrics,
  accessors,
}) {
  // Create proxy events and order them so that we don't have
  // to fiddle with z-indexes.
  const proxies = events.map(
    (event) => new Event(event, { slotMetrics, accessors })
  )
  const eventsInRenderOrder = sortByRender(proxies)

  // Group overlapping events, while keeping order.
  // Create tree for overlapping events.
  let eventsCopy = [...eventsInRenderOrder]
  let parentEvents = []
  // iterate over to create sub-trees
  do {
    // remove remove top level parents for current iteration
    eventsCopy = eventsCopy.filter((event) => !parentEvents.includes(event))
    parentEvents = []
    for (let i = 0; i < eventsCopy.length; i++) {
      const event = eventsCopy[i]

      // Check if this event can go into a parent event.
      const parent = parentEvents.find(
        (c) =>
          c.end > event.start ||
          Math.abs(event.start - c.start) < minimumStartDifference
      )

      // Couldn't find a parent — that means this event is a parent.
      if (!parent) {
        parentEvents.push(event)
        continue
      }

      // Found a parent for the event.
      event.parent = parent
      // event from parent clild list
      if (parent.parent) {
        parent.parent.children = parent.parent.children.filter(
          (e) => e !== event
        )
      }
      if (!parent.children) {
        parent.children = []
      }
      parent.children.push(event)
    }
  } while (parentEvents.length > 0)

  // Return the original events, along with their styles.
  return eventsInRenderOrder.map((event) => ({
    event: event.data,
    style: {
      top: event.top,
      height: event.height,
      width: event.width,
      xOffset: Math.max(0, event.xOffset),
    },
  }))
}
