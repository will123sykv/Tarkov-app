import type { QuestDataInput } from '../src/main/quests/questData'

// Shaped like json.tarkov.dev's `tasks`, `maps` and `traders` files (as the CI probe logged them).

export const PRAPOR = '54cb50c76803fa8b248b4571'
export const THERAPIST = '54cb57776803fa99248b456e'
export const CUSTOMS = '56f40101d2720b2a4d8b45d6'
export const WOODS = '5704e3c2d2720bac5b8b4567'
export const WORKBENCH = '5d484fda654e7600681d9315'
export const KEY = {
  unknown: '593962ca86f774068014d9af',
  dorm303: '593aa4be86f77457f56379f8',
  dorm303copy: '5913611c86f77479e0084092',
  /** Only a lock names it. */
  cabin: '5d80c88d86f77440556dbf07',
  labs: '5c94bbff86f7747ee735c08f'
}
export const ROUBLES = '5449016a4bdc2d6f028b456f'
export const STASH = '5d484fc0654e76006657e0ab'
export const LAVATORY = '5d484fba654e7600691aadf7'
export const BOLTS = '57347c93245977448d35f6e3'
export const LEDX = '5c0530ee86f774697952d952'
export const SCREWDRIVER = '590c2d8786f774245b1f03f3'

export const Q = {
  debut: '5936d90786f7742b1420ba5b',
  checking: '5936da9e86f7742d65037edf',
  shootout: '5bc4776586f774512d07cf05',
  firstAid: '5967733e86f774602332fc84',
  kappaOnly: '5c51aac186f77432ea65c552',
  usecOnly: '6179b5eabca27a099552e052',
  aidStations: '6a5672392ee61bd094c49e27'
}

/** A story chapter: tarkov.dev leaves it out of `tasks` but keeps its name. */
export const STORY_ID = '6a00000000000000000000a1'

const quest = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `${id} name`,
  normalizedName: id,
  trader: PRAPOR,
  wikiLink: `https://escapefromtarkov.fandom.com/wiki/${id}`,
  minPlayerLevel: 1,
  taskRequirements: [],
  traderRequirements: [],
  objectives: [],
  kappaRequired: false,
  lightkeeperRequired: false,
  factionName: 'Any',
  experience: 1000,
  map: null,
  ...extra
})

export const RAW_QUEST_DATA: QuestDataInput = {
  tasks: {
    tasks: [
      quest(Q.debut, {
        objectives: [
          {
            id: 'o-debut-shoot',
            description: 'o-debut-shoot',
            type: 'shoot',
            count: 5,
            optional: false,
            zones: [],
            maps: [CUSTOMS]
          },
          {
            id: 'o-debut-give',
            description: 'o-debut-give',
            type: 'giveItem',
            count: 2,
            optional: false,
            items: ['5448be9a4bdc2dfd2f8b456a'],
            foundInRaid: true
          }
        ]
      }),
      quest(Q.checking, {
        minPlayerLevel: 2,
        map: CUSTOMS,
        taskImageLink: `https://assets.tarkov.dev/${Q.checking}.webp`,
        neededKeys: [
          { map: CUSTOMS, keys: [KEY.unknown, KEY.dorm303] },
          { map: WOODS, keys: [] }
        ],
        startRewards: { items: [{ item: ROUBLES, count: 20000, attributes: {} }], traderStanding: [] },
        finishRewards: {
          traderStanding: [{ standing: 0.1, trader: PRAPOR }],
          items: [
            { item: ROUBLES, count: 80000, attributes: {} },
            { item: '5448be9a4bdc2dfd2f8b456a', count: 2, attributes: {} },
            { count: 1 }
          ],
          offerUnlock: [
            {
              id: 'u1',
              level: 2,
              item: '5c0e530286f7747fa1419862',
              count: 1,
              contains: [],
              trader: THERAPIST
            }
          ],
          skillLevelReward: [
            { level: 2, skill: 'StressResistance' },
            { level: 1, skill: 'TroubleShooting' }
          ],
          traderUnlock: ['6617beeaa9cfa777ca915b7c'],
          craftUnlock: [
            { level: 1, station: WORKBENCH, item: '5f0596629e22f464da6bbdd9', count: 60 },
            { level: 3, station: 'unknown-station', item: '5e023d34e8a400319a28ed44', count: 30 }
          ],
          achievement: ['664f23e44702fd5db50ee732', '675709bef4e2a2ce0f058f56'],
          customization: [
            { id: 'c1', name: 'c1 Name', customizationType: 'ShootingRangeMark' },
            { id: 'c2', name: 'c2 Name', customizationType: 'Floor' }
          ],
          traderDialogueUnlock: ['5c0647fdd443bc2504c2d371'],
          locationUnlock: []
        },
        taskRequirements: [{ task: Q.debut, status: ['complete'] }],
        objectives: [
          {
            id: 'o-checking-find',
            description: 'o-checking-find',
            type: 'findQuestItem',
            count: 1,
            optional: false,
            possibleLocations: [{ map: CUSTOMS, positions: [{ x: 10, y: 1, z: -20 }] }],
            maps: [CUSTOMS],
            questItem: '590c62a386f77412b0130255',
            requiredKeys: [[KEY.unknown], [KEY.dorm303, KEY.dorm303copy], []]
          },
          {
            id: 'o-checking-ll',
            description: 'o-checking-ll',
            type: 'traderLevel',
            optional: false,
            trader: THERAPIST,
            level: 2
          },
          {
            id: 'o-checking-visit',
            description: 'o-checking-visit',
            type: 'visit',
            optional: true,
            zones: [
              {
                id: 'zone',
                map: CUSTOMS,
                position: { x: 100, y: 2, z: 50 },
                outline: [
                  { x: 95, y: 2, z: 45 },
                  { x: 105, y: 2, z: 45 },
                  { x: 105, y: 2, z: 55 }
                ],
                top: 4,
                bottom: 0
              },
              { id: 'broken', map: CUSTOMS }
            ],
            maps: [CUSTOMS]
          }
        ]
      }),
      quest(Q.shootout, {
        minPlayerLevel: 10,
        trader: THERAPIST,
        map: WOODS,
        taskRequirements: [
          { task: Q.checking, status: ['active', 'complete'] },
          { task: Q.debut, status: ['complete'] }
        ],
        objectives: [
          {
            id: 'o-shootout-give',
            description: 'o-shootout-give',
            type: 'giveItem',
            count: 3,
            optional: false,
            items: ['5448be9a4bdc2dfd2f8b456a', '5751a89d24597722aa0e8db0'],
            foundInRaid: false
          }
        ]
      }),
      quest(Q.firstAid, {
        trader: THERAPIST,
        taskRequirements: [{ task: Q.debut, status: ['failed'] }],
        objectives: [
          {
            id: 'o-aid-level',
            description: 'o-aid-level',
            type: 'playerLevel',
            optional: false,
            playerLevel: 15
          },
          {
            id: 'o-aid-task',
            description: 'o-aid-task',
            type: 'taskStatus',
            optional: false,
            task: { id: Q.checking },
            status: ['active', 'complete']
          }
        ]
      }),
      quest(Q.kappaOnly, { kappaRequired: true, lightkeeperRequired: true, minPlayerLevel: 40 }),
      quest(Q.usecOnly, { factionName: 'USEC' }),
      // Since update 1.1: gated by Therapist LL2 (level 5), which tarkov.dev folds into its level.
      quest(Q.aidStations, {
        trader: THERAPIST,
        minPlayerLevel: 5,
        traderRequirements: [
          { id: 'r1', requirementType: 'level', compareMethod: '>=', value: 2, trader: THERAPIST },
          { id: 'r2', requirementType: 'reputation', compareMethod: '<=', value: -1, trader: { id: PRAPOR } },
          { id: 'r3', requirementType: 'loyalty?', value: 2, trader: PRAPOR }
        ]
      }),
      { name: 'no id' }
    ],
    questItems: { '590c62a386f77412b0130255': { name: '590c62a386f77412b0130255 Name' } }
  },
  tasksLang: {
    [`${Q.debut} name`]: 'Debut',
    [`${Q.checking} name`]: 'Checking',
    [`${Q.shootout} name`]: 'Shootout Picnic',
    [`${Q.firstAid} name`]: 'First Aid',
    [`${Q.kappaOnly} name`]: 'Collector',
    [`${Q.usecOnly} name`]: 'USEC Only',
    [`${Q.aidStations} name`]: 'Aid Stations',
    [`${STORY_ID} name`]: 'Tour',
    [`${STORY_ID} description`]: 'Not a name',
    'o-debut-shoot': 'Eliminate 5 Scavs on Customs',
    'o-debut-give': 'Hand over 2 MP-133 shotguns',
    'o-checking-find': 'Obtain the Bronze pocket watch',
    'o-checking-visit': 'Visit the trailer park',
    'o-shootout-give': 'Hand over 3 of either item',
    '590c62a386f77412b0130255 Name': 'Bronze pocket watch',
    '664f23e44702fd5db50ee732 name': 'Jack of All Trades',
    StressResistance: 'Stress resistance',
    'c1 Name': 'Golden target mark'
  },
  maps: {
    maps: [
      {
        id: CUSTOMS,
        name: `${CUSTOMS} Name`,
        normalizedName: 'customs',
        nameId: 'bigmap',
        extracts: [
          {
            name: 'ZB-1011',
            faction: 'pmc',
            position: { x: -17.5, y: 2, z: -61.3 },
            outline: [{ x: -13.9, y: 0.2, z: -66.6 }]
          },
          { name: 'No position', faction: 'scav' },
          {
            name: 'Dorms V-Ex',
            faction: 'pmc',
            position: { x: 181, y: -0.7, z: 213 },
            transferItem: { item: '5449016a4bdc2d6f028b456f', count: 20000 }
          }
        ],
        spawns: [
          { position: { x: 1, y: 0, z: 2 }, sides: ['pmc'], categories: ['player'] },
          { position: { x: 3, y: 0, z: 4 }, sides: ['all'], categories: ['bot'] },
          { position: { x: 175, y: 2, z: 145 }, zoneName: 'ZoneDormitory', categories: ['bot', 'boss'] },
          // A second point of the same zone a metre away, and one elsewhere with no known boss.
          { position: { x: 176, y: 2, z: 145 }, zoneName: 'ZoneDormitory', categories: ['bot', 'boss'] },
          { position: { x: 24, y: 3, z: -90 }, zoneName: 'ZoneCustoms', categories: ['boss'] },
          { position: { x: 194, y: 1, z: -170 }, zoneName: 'ZoneSnipeBrige', categories: ['bot', 'boss'] },
          { position: { x: 196, y: 3, z: -172 }, zoneName: 'ZoneSnipeBrige', categories: ['bot'] }
        ],
        transits: [{ description: 'transitWoods', position: { x: 5, y: 0, z: 6 } }],
        bosses: [
          {
            mob: 'bossBully',
            spawnChance: 0.6,
            spawnLocations: [
              { spawnKey: 'ZoneDormitory', name: 'Dorms', chance: 0.33 },
              { spawnKey: 'ZoneGasStation', name: 'New Gas Station', chance: 0.33 }
            ]
          },
          { mob: 'bossPartisan', spawnChance: 0.15, spawnLocations: [] },
          {
            mob: 'sectantPriest',
            spawnChance: 0.2,
            spawnLocations: [{ spawnKey: 'ZoneDormitory', chance: 1 }]
          }
        ],
        lootContainers: [{ huge: true }],
        // Locks, and loose loot spots: only those where a known key can spawn are kept.
        locks: [
          {
            id: 'l1',
            lockType: 'door',
            key: KEY.dorm303,
            needsPower: false,
            position: { x: 180, y: 6, z: 140 }
          },
          { id: 'l2', lockType: 'trunk', key: { id: KEY.cabin }, position: { x: -20, y: 1, z: 30 } },
          { id: 'l3', lockType: 'door', key: null, position: { x: 1, y: 1, z: 1 } },
          { id: 'l4', lockType: 'door', key: KEY.cabin }
        ],
        lootLoose: [
          { position: { x: 170, y: 6, z: 141 }, items: [KEY.dorm303] },
          { position: { x: 10, y: 1, z: 10 }, items: ['5449016a4bdc2d6f028b456f', KEY.cabin, KEY.unknown] },
          { position: { x: 11, y: 1, z: 11 }, items: ['5449016a4bdc2d6f028b456f'] }
        ],
        minPlayerLevel: 0,
        maxPlayerLevel: 100,
        accessKeys: []
      },
      {
        id: WOODS,
        name: `${WOODS} Name`,
        normalizedName: 'woods',
        nameId: 'Woods',
        extracts: [],
        spawns: [],
        // Ground Zero style level cap, and an item to get in (the Lab's keycard).
        minPlayerLevel: 0,
        maxPlayerLevel: 20,
        accessKeys: [KEY.labs]
      }
    ],
    mobs: [
      { id: 'bossBully', name: 'bossBully', normalizedName: 'reshala' },
      { id: 'sectantPriest', name: 'sectantPriest', normalizedName: 'cultist-priest' }
    ]
  },
  mapsLang: {
    [`${CUSTOMS} Name`]: 'Customs',
    bossBully: 'Reshala',
    [`${WOODS} Name`]: 'Woods',
    'ZB-1011': 'ZB-1011',
    transitWoods: 'Transit to Woods'
  },
  traders: {
    [PRAPOR]: {
      id: PRAPOR,
      name: `${PRAPOR} Nickname`,
      imageLink: `https://assets.tarkov.dev/${PRAPOR}.webp`,
      levels: [
        { id: `${PRAPOR}-1`, level: 1, requiredPlayerLevel: 0 },
        { id: `${PRAPOR}-2`, level: 2, requiredPlayerLevel: 6 }
      ]
    },
    [THERAPIST]: {
      id: THERAPIST,
      name: `${THERAPIST} Nickname`,
      levels: [
        { id: `${THERAPIST}-1`, level: 1, requiredPlayerLevel: 0 },
        { id: `${THERAPIST}-2`, level: 2, requiredPlayerLevel: 5 }
      ]
    }
  },
  tradersLang: { [`${PRAPOR} Nickname`]: 'Prapor', [`${THERAPIST} Nickname`]: 'Therapist' },
  hideout: {
    [WORKBENCH]: {
      id: WORKBENCH,
      name: 'hideout_area_10_name',
      normalizedName: 'workbench',
      areaType: 10,
      imageLink: 'https://assets.tarkov.dev/station-workbench.png',
      levels: [
        {
          id: `${WORKBENCH}-2`,
          level: 2,
          constructionTime: 7200,
          traderRequirements: [
            { id: 't', requirementType: 'level', compareMethod: '>=', value: 2, trader: PRAPOR },
            { id: 'r', requirementType: 'reputation', compareMethod: '>=', value: 0.5, trader: PRAPOR }
          ],
          stationLevelRequirements: [
            { id: 's1', station: WORKBENCH, level: 1 },
            { id: 's2', station: LAVATORY, level: 1 }
          ],
          itemRequirements: [
            { id: 'i1', item: BOLTS, count: 3, attributes: { foundInRaid: false } },
            { id: 'i2', item: LEDX, count: 1, attributes: { foundInRaid: true } },
            { id: 'i3', count: 1 }
          ],
          skillRequirements: [{ id: 'k', level: 2, skill: 'HideoutManagement' }],
          bonuses: []
        },
        {
          id: `${WORKBENCH}-1`,
          level: 1,
          constructionTime: 0,
          traderRequirements: [],
          stationLevelRequirements: [],
          itemRequirements: [{ id: 'i0', item: ROUBLES, count: 20000, attributes: { foundInRaid: false } }],
          skillRequirements: []
        }
      ]
    },
    [LAVATORY]: { id: LAVATORY, name: 'missing', normalizedName: 'nutrition-unit' },
    [STASH]: {
      id: STASH,
      name: 'hideout_area_3_name',
      normalizedName: 'stash',
      levels: [
        {
          id: `${STASH}-1`,
          level: 1,
          constructionTime: 0,
          itemRequirements: [],
          stationLevelRequirements: []
        },
        {
          id: `${STASH}-2`,
          level: 2,
          constructionTime: 3600,
          itemRequirements: [{ id: 'm', item: ROUBLES, count: 2000000, attributes: { foundInRaid: false } }]
        }
      ]
    }
  },
  hideoutLang: { hideout_area_10_name: 'Workbench', hideout_area_3_name: 'Stash' },
  // As json.tarkov.dev's `crafts` file has them (1.21.0): one product each, tools flagged.
  crafts: [
    {
      id: 'craft-ledx',
      requiredItems: [
        { item: BOLTS, count: 4, attributes: {} },
        { item: SCREWDRIVER, count: 1, attributes: { tool: true } },
        { item: ROUBLES, count: 5000, attributes: {} }
      ],
      requiredQuestItems: [],
      station: WORKBENCH,
      duration: 7200,
      gameEditions: [],
      level: 2,
      productItem: { item: LEDX, count: 1, attributes: {} },
      taskUnlock: Q.checking
    },
    {
      id: 'craft-bolts',
      requiredItems: [{ item: SCREWDRIVER, count: 1, attributes: { functional: true } }],
      requiredQuestItems: [],
      station: WORKBENCH,
      duration: 1800,
      gameEditions: [],
      level: 1,
      productItem: { item: BOLTS, count: 3, attributes: {} }
    },
    // Without a station or a product: left out.
    { id: 'broken', requiredItems: [], station: WORKBENCH, level: 1, duration: 60 }
  ]
}
