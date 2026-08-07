// MUI v9 slot props reject arbitrary `data-*` keys by design; consumers opt in
// by augmenting DataAttributesOverrides. The e2e suite locates almost every
// control through data-testid, including ones that only exist inside a slot
// (the date-time picker's html input, for example), so declare the one key we
// use. Listing it explicitly rather than using an index signature keeps typos
// a compile error.
declare module '@mui/utils/types' {
  interface DataAttributesOverrides {
    'data-testid'?: string
  }
}

export {}
