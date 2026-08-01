# Morocco has the sunlight. It never had the numbers.

*A free tool that tells any Moroccan household what a solar roof would
actually produce, save, and pay back — in about thirty seconds.*

**Try it → [atlas-nexus-69o.pages.dev/solar](https://atlas-nexus-69o.pages.dev/solar/)**
**Source → [github.com/redatahiri37/morocco-energy-digital-map](https://github.com/redatahiri37/morocco-energy-digital-map)**

---

Morocco receives between 1 800 and 2 200 kWh per installed kilowatt-peak
every year. That is among the best solar resources on earth — roughly
60 % more than Germany, a country that put solar on two million roofs.

Fewer than 1 % of Moroccan homes have a panel.

That gap is not about sunlight, and it is not about hardware cost. It is
about information.

## Why

Ask a Moroccan homeowner whether solar is worth it and you get a shrug.
Not because they are uninterested — because nobody can tell them. The
honest answer requires irradiance data for their exact coordinates, the
ONEE tariff schedule, a self-consumption model, and a discounted cash
flow. The only people holding those numbers are the installers, and an
installer's estimate arrives attached to a sales call.

So the household does nothing. Doing nothing is free and feels safe.

Two things changed this year. In March 2026, decree 2.25.100 finally
activated Law 82-21: residential self-consumption below 11 kW is now a
simple prior declaration, with a bidirectional meter and surplus
injection capped at 20 % of annual production. The legal blocker is
gone.

And the economics quietly became excellent — for a reason most people
miss.

## How

ONEE's residential tariff is progressive. The first 100 kWh each month
cost 0,90 MAD. Above 500 kWh, you pay 1,60 MAD. Nearly double.

Solar does not displace your average kilowatt-hour. It displaces your
**most expensive** one — the top of the block, first.

This inverts the usual intuition. A household paying 400 MAD a month
sits low in the schedule; a right-sized 2 kWc system in Casablanca saves
about 2 375 MAD a year and pays back in roughly ten years. A household
paying 1 200 MAD a month is deep in the 1,60 MAD tranche; a 5 kWc system
saves about 7 458 MAD a year and pays back in **eight**.

The bigger your bill, the faster solar pays. That single mechanism is
the strongest argument for rooftop PV in Morocco, and almost nobody
states it in numbers.

Also note what these figures do *not* lean on. Export revenue is capped
at 20 % of production and compensated around 0,18 MAD/kWh — about a
ninth of the retail rate it replaces. Grid injection is a rounding
error. Moroccan rooftop solar is a self-consumption play, full stop.
The tool leaves export off by default, and says so.

## What

**Atlas Solar.** You type an address. You get one number: dirhams saved
per year. Underneath it, the recommended system size, annual production,
payback, and CO₂ avoided.

There is exactly one control on the first screen — your monthly
electricity bill. Not kilowatt-hours. People know their bill; almost
nobody knows their consumption, and asking for kWh is where every other
calculator loses its user. The tool inverts the ONEE tariff schedule to
recover consumption from the bill, then sizes a system covering 80 % of
annual demand.

If you want to argue with it, open the parameters: panel capacity, roof
tilt, orientation, installed cost per watt-peak, grid injection. Every
assumption is exposed and adjustable. Nothing is hidden behind a form.

Production comes from PVGIS v5.2, the European Commission's Joint
Research Centre model, queried at your exact coordinates. Tariffs are
the published ONEE residential schedule. The financing comparison shows
cash purchase against a ten-year loan, because the barrier is rarely the
25-year return — it is the 33 000 dirhams up front.

No login. No email. No token. No lead capture, ever. I do not sell
panels and I am not sending your address to anyone who does.

## What it is not

It is not a quote. Roof shading, structural condition, inverter
placement and local installer pricing all move the answer, and none of
them are in this model. Self-consumption uses a typical residential load
curve, not yours. Treat the output as the number that tells you whether
the conversation with an installer is worth having.

That is the entire ambition. Not to replace the installer — to make
sure the homeowner walks into that conversation already knowing what
good looks like.

Morocco is building gigawatts of utility-scale solar and exporting the
story to Europe. Meanwhile the cheapest megawatt in the country is
sitting unbuilt on a few million residential rooftops, blocked by a
question nobody was answering.

Now it is answered. Free, open, and in thirty seconds.

**[Try it on your own address →](https://atlas-nexus-69o.pages.dev/solar/)**

---

*Built as part of Atlas Nexus — open mapping of the energy × digital
infrastructure nexus in Morocco and the wider MEA region. Code is MIT,
data sources are cited feature by feature, and corrections are welcome.*
