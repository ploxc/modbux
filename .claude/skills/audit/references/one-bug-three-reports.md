# The same bug from three directions

Six areas were audited in parallel. The agents could not see each other, which is
what makes a refutation reviewer worth having and also what produces this:

| the area | names it as | claim |
| --- | --- | --- |
| modbus | `modbusServer.ts removeRegister` | clears a fixed 24 registers where `addRegister` wrote `length ?? 10` |
| server-ui | `DeleteButton` and `addRegister.zustand.ts submit` | removing a utf8 register blanks unrelated registers past its end |
| shared | `addressGrouping.ts getRegisterLength` | returns 24 with no `nextAddress`, and takes no `length` parameter at all |

One defect. Three blocking findings. Three different files named, and **none of
the three is where the fix belongs**: the width is stated in several places that
do not agree, and only the `shared` agent could see that, because only it was
reading the file that holds the table.

The `boundary` agent found the same asymmetry a level up: the add path and the
remove path validate against different schemas, so a register can go in at an
address it cannot come out of.

Fixing any one of these leaves the others standing, and fixing all of them
without settling where the width lives leaves the remaining copies disagreeing.

## What this cost, and what it bought

The grouping pass is a reading round over every area document after the audits
and before anyone fixes anything. Twenty-eight blocking findings came out of it
as twenty-one causes. The saving is small and it is not the point: three of the
four reports above are one edit, and nothing inside a single area document says
so.

It also introduces its own failure: a cluster that is really two causes gets
fixed as one, and the half nobody looked at survives with the ticket closed. That
is not hypothetical. On the run this reference is drawn from, five of seven
clusters held more than one cause and the reviewer named each of them. So the
grouping goes to the refutation reviewer along with the claims, and that reviewer
is asked to break the grouping before it looks at a single claim.
