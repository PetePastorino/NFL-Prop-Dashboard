type Line = [string, number];
const render = (market: string, entries: Line[]) => entries.map(([player, line]) => `${player} ${market} ${line}`).join('\n');

const passing: Line[] = [
  ['Jared Goff', 263.5], ['Joe Burrow', 260.5], ['Jordan Love', 258.5], ['Bryce Young', 255.5],
  ['Trevor Lawrence', 253.5], ['Kirk Cousins', 237.5], ['Sam Darnold', 233.5], ['Caleb Williams', 227.5],
  ['Drake Maye', 227.5], ['Patrick Mahomes', 226.5], ['Geno Smith', 224.5], ['Kyler Murray', 218.5],
  ['Baker Mayfield', 217.5], ['Bo Nix', 202.5], ['Cam Ward', 200.5], ['Malik Willis', 182.5],
];

const rushing: Line[] = [
  ['Jahmyr Gibbs', 84.5], ['Kenneth Walker', 83.5], ['Bucky Irving', 69.5], ['Chuba Hubbard', 68.5],
  ['Ollie Gordon', 61.5], ['Bhayshul Tuten', 61.5], ['Tony Pollard', 60.5], ['Josh Jacobs', 58.5],
  ['Rhamondre Stevenson', 53.5], ['Jonah Coleman', 38.5], ['Malik Willis', 30.5], ['JK Dobbins', 25.5],
  ['Drake Maye', 22.5], ['Marshawn Lloyd', 18.5], ['Bo Nix', 17.5], ['Patrick Mahomes', 12.5],
  ['Bryce Young', 10.5], ['Jordan Love', 4.5],
];

const receiving: Line[] = [
  ['Jaxon Smith-Njigba', 100.5], ["Ja'Marr Chase", 77.5], ['Drake London', 77.5], ['Justin Jefferson', 77.5],
  ['Amon-Ra St Brown', 77.5], ['Tetairoa McMillan', 71.5], ['Christian Watson', 70.5], ['Parker Washington', 68.5],
  ['Tee Higgins', 65.5], ['Jalen Coker', 62.5], ['Matthew Golden', 59.5], ['Carnell Tate', 54.5],
  ['AJ Brown', 52.5], ['Luther Burden', 52.5], ['Jameson Williams', 50.5], ['Sam Laporta', 50.5],
  ['Tucker Kraft', 44.5], ['Rome Odunze', 42.5], ['Jordan Addison', 41.5], ['Colston Loveland', 41.5],
  ['TJ Hockenson', 40.5], ["Wan'Dale Robinson", 37.5], ['Kyle Pitts', 37.5], ['Malik Washington', 37.5],
  ['Jahmyr Gibbs', 34.5], ['Bijan Robinson', 28.5], ['Jahan Dotson', 23.5], ['Kalif Raymond', 22.5],
  ['Savion Williams', 22.5], ['Darren Waller', 19.5], ['Gunnar Helm', 17.5], ['Josh Jacobs', 15.5],
  ['Chuba Hubbard', 15.5], ['John Metchie', 15.5], ['Bucky Irving', 13.5], ['Kenny Gainwell', 10.5],
  ['Marshawn Lloyd', 5.5],
];

const receptions: Line[] = [
  ['Jaxon Smith-Njigba', 7.5], ["Ja'Marr Chase", 6.5], ['Drake London', 6.5], ['Amon-Ra St Brown', 6.5],
  ['Justin Jefferson', 5.5], ['Tetairoa McMillan', 5.5], ['Jahmyr Gibbs', 4.5], ['Christian Watson', 4.5],
  ['Sam Laporta', 4.5], ['TJ Hockenson', 4.5], ['Tee Higgins', 4.5], ['Tucker Kraft', 4.5],
  ['Parker Washington', 4.5], ['Jalen Coker', 4.5], ['Matthew Golden', 4.5], ['Luther Burden', 4.5],
  ['Colston Loveland', 4.5], ['Carnell Tate', 4.5], ['Bijan Robinson', 3.5], ["Wan'Dale Robinson", 3.5],
  ['Jameson Williams', 3.5], ['Jordan Addison', 3.5], ['Kyle Pitts', 3.5], ['Rome Odunze', 3.5],
  ['Josh Jacobs', 2.5], ['Chuba Hubbard', 2.5], ['Kalif Raymond', 2.5], ['Darren Waller', 2.5],
  ['Bucky Irving', 2.5], ['Savion Williams', 2.5], ['John Metchie', 1.5], ['Jahan Dotson', 1.5],
  ['Gunnar Helm', 1.5],
];

export const WEEK8_INITIAL_PROP_LINES = [
  render('Passing Yards', passing),
  render('Rushing Yards', rushing),
  render('Receiving Yards', receiving),
  render('Receptions', receptions),
].join('\n');
