# The same bug from three directions

Six areas were audited in parallel on 2 September 2026. The agents could not see
each other, which is what makes a refutation reviewer worth having and also what
produces this:

| document | names it as | claim |
| --- | --- | --- |
| `AUDIT-modbus.md` F4 | `modbusServer.ts removeRegister` | clears a fixed 24 registers where `addRegister` wrote `length ?? 10` |
| `AUDIT-server-ui.md` F2 | `DeleteButton` and `addRegister.zustand.ts submit` | removing a utf8 register blanks unrelated registers up to 23 addresses past its end |
| `AUDIT-shared.md` 2 | `addressGrouping.ts getRegisterLength` | returns 24 with no `nextAddress`, and takes no `length` parameter at all |

One defect. Three blocking findings. Three different files named, and **none of
the three is where the fix belongs**: the width is stated in five places that do
not agree, and only the `shared` agent could see that, because only it was
reading the file that holds the table.

`AUDIT-boundary.md` B-02 is the same asymmetry a level up: the add path and the
remove path validate against different schemas, so a register can go in at an
address it cannot come out of.

Fixing any one of the three leaves the other two standing, and fixing all three
without settling where the width lives leaves four copies still disagreeing.

## What this cost, and what it bought

The grouping pass is a reading round over every area document after the audits
and before anyone fixes anything. It cut 28 blocking findings to 13 causes here.

It also introduces its own failure: a cluster that is really two causes gets
fixed as one, and the half nobody looked at survives with the ticket closed. So
the grouping goes to the refutation reviewer along with the claims, and that
reviewer is asked to break the grouping first.
