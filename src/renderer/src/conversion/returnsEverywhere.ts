import { SyntaxNode } from '@lezer/common'
import { parser } from '@lezer/javascript'

/** What a statement list holds besides statements. */
const PUNCTUATION = new Set(['{', '}', ';', 'LineComment', 'BlockComment'])

/** The statements directly under `node`, in order. */
const statementsOf = (node: SyntaxNode): SyntaxNode[] => {
  const statements: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!PUNCTUATION.has(child.name)) statements.push(child)
  }
  return statements
}

/**
 * Whether a run of statements ends in a return of a value on every path: a
 * statement that does so ends the run, and a `break` before it leaves it.
 */
const runReturns = (statements: SyntaxNode[]): boolean => {
  for (const statement of statements) {
    if (statement.name === 'BreakStatement') return false
    if (returns(statement)) return true
  }
  return false
}

/** Whether a `switch` returns a value from every case, a default among them. */
const switchReturns = (body: SyntaxNode): boolean => {
  const segments: SyntaxNode[][] = []
  let hasDefault = false
  for (const node of statementsOf(body)) {
    if (node.name === 'CaseLabel' || node.name === 'DefaultLabel') {
      if (node.name === 'DefaultLabel') hasDefault = true
      segments.push([])
    } else {
      segments.at(-1)?.push(node)
    }
  }
  // An empty case falls through to the next one, so only the filled ones count.
  const filled = segments.filter((segment) => segment.length > 0)
  const last = segments.at(-1)
  return hasDefault && last !== undefined && last.length > 0 && filled.every(runReturns)
}

/** Whether a statement returns a value, or throws, on every path through it. */
const returns = (node: SyntaxNode): boolean => {
  switch (node.name) {
    case 'ReturnStatement':
      // `return` alone returns nothing.
      return statementsOf(node).some((child) => child.name !== 'return')
    case 'ThrowStatement':
      return true
    case 'Block':
      return runReturns(statementsOf(node))
    case 'IfStatement': {
      const parts = statementsOf(node)
      const elseAt = parts.findIndex((part) => part.name === 'else')
      if (elseAt === -1) return false
      const then = parts[elseAt - 1]
      const otherwise = parts[elseAt + 1]
      return then !== undefined && otherwise !== undefined && returns(then) && returns(otherwise)
    }
    case 'TryStatement': {
      const parts = statementsOf(node)
      const blockOf = (clause: SyntaxNode): boolean =>
        statementsOf(clause).some((part) => part.name === 'Block' && returns(part))
      const finallyClause = parts.find((part) => part.name === 'FinallyClause')
      if (finallyClause && blockOf(finallyClause)) return true
      const tryBlock = parts.find((part) => part.name === 'Block')
      const catches = parts.filter((part) => part.name === 'CatchClause')
      return tryBlock !== undefined && returns(tryBlock) && catches.every(blockOf)
    }
    case 'SwitchStatement': {
      const body = statementsOf(node).find((part) => part.name === 'SwitchBody')
      return body !== undefined && switchReturns(body)
    }
    default:
      return false
  }
}

/**
 * Whether a conversion script returns a value on every path. A script that
 * can end without one leaves the cell with nothing, so it is refused rather
 * than found out on the value that takes that path.
 */
export const returnsEverywhere = (code: string): boolean =>
  runReturns(statementsOf(parser.parse(code).topNode))
