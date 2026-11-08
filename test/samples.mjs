// One small diagram per Mermaid diagram type, used by the tests.
export const samples = {
  flowchart: `flowchart LR
  A[Hard] -->|Text| B(Round)
  B --> C{Decision}
  C -->|One| D[Result 1]
  C -->|Two| E[Result 2]`,
  sequence: `sequenceDiagram
  participant A as Alice
  participant B as Bob
  A->>B: Hello Bob, how are you?
  B-->>A: Great!
  loop Every minute
    A->>B: Ping
  end
  Note right of B: Bob thinks`,
  class: `classDiagram
  Animal <|-- Duck
  Animal <|-- Fish
  Animal : +int age
  Animal : +isMammal()
  class Duck {
    +String beakColor
    +swim()
  }`,
  state: `stateDiagram-v2
  [*] --> Still
  Still --> Moving
  Moving --> Still
  Moving --> Crash
  Crash --> [*]`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER {
    string name
    string email
  }`,
  gantt: `gantt
  title A Gantt Diagram
  dateFormat YYYY-MM-DD
  section Section
  A task :a1, 2024-01-01, 30d
  Another task :after a1, 20d
  section Another
  Task in sec :2024-01-12, 12d`,
  pie: `pie title Pets adopted
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`,
  mindmap: `mindmap
  root((Notes))
    Origins
      Long history
    Tools
      SilverBullet
      Pele`,
  timeline: `timeline
  title History of notes
  2002 : LinkedIn
  2004 : Facebook : Google
  2005 : YouTube`,
  gitGraph: `gitGraph
  commit
  branch develop
  checkout develop
  commit
  checkout main
  merge develop
  commit`,
  journey: `journey
  title My working day
  section Go to work
    Make tea: 5: Me
    Go upstairs: 3: Me
  section Go home
    Go downstairs: 5: Me`,
  quadrant: `quadrantChart
  title Reach and engagement
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 Expand
  quadrant-2 Promote
  quadrant-3 Re-evaluate
  quadrant-4 Improve
  Campaign A: [0.3, 0.6]
  Campaign B: [0.45, 0.23]`,
  xychart: `xychart
  title "Sales"
  x-axis [jan, feb, mar, apr]
  y-axis "Revenue" 0 --> 100
  bar [30, 50, 70, 40]
  line [20, 45, 60, 80]`,
  sankey: `sankey
Agricultural waste,Bio-conversion,124.7
Bio-conversion,Liquid,0.6
Bio-conversion,Solid,280.3`,
  kanban: `kanban
  todo[Todo]
    t1[Write docs]
  doing[In progress]
    t2[Render diagrams]
  done[Done]
    t3[Ship plug]`,
  block: `block
  columns 3
  a b c
  d e f`,
  architecture: `architecture-beta
  group api(cloud)[API]
  service db(database)[Database] in api
  service server(server)[Server] in api
  db:L -- R:server`,
  c4: `C4Context
  title System Context
  Person(user, "User", "Writes notes")
  System(sb, "SilverBullet", "Notes app")
  Rel(user, sb, "Uses")`,
  requirement: `requirementDiagram
  requirement test_req {
    id: 1
    text: the test text.
    risk: high
    verifymethod: test
  }
  element test_entity {
    type: simulation
  }
  test_entity - satisfies -> test_req`,
  packet: `packet
  0-15: "Source Port"
  16-31: "Destination Port"
  32-63: "Sequence Number"`,
  radar: `radar-beta
  axis A, B, C, D
  curve c1{1, 2, 3, 4}
  curve c2{4, 3, 2, 1}`,
  treemap: `treemap-beta
"Notes"
  "Work": 10
  "Personal": 20`,
};

export const invalid = `flowchart LR
  A --> `;

export const wide = `flowchart LR
  A[Collect the requirements] --> B[Write a design document]
  B --> C[Review the design with the team]
  C --> D[Implement the feature]
  D --> E[Write the tests]
  E --> F[Ship it to production]`;

export const links = `flowchart LR
  A[Docs] --> B[Wiki]
  click A "https://example.com/docs"
  class B internal-link`;
