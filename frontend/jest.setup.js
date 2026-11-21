import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'
import { toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

// jsdom lacks these browser APIs used by the map components.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver || ResizeObserverStub
global.TextEncoder = global.TextEncoder || TextEncoder
global.TextDecoder = global.TextDecoder || TextDecoder
HTMLCanvasElement.prototype.getContext = function getContext() {
  return null
}
