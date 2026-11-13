/** Deliberately recognizable demo content, populated only for a new database. */
export function seedStore(store) {
  if (store.all("users").length) return;
  const now = Date.now();
  const date = (days, hours = 0) =>
    new Date(now + (days * 24 + hours) * 3600000).toISOString();
  const definitions = [
    {
      id: "design",
      title: "Design principles",
      code: "DES101",
      category: "Design",
      cover: "design",
      color: "#e6e8d8",
      status: "published",
      description:
        "Build your creative foundation. Explore visual hierarchy, color, typography, and the thoughtful decisions behind effective design.",
      modules: [
        "The foundations of good design",
        "Color, type & visual language",
        "Putting principles into practice",
      ],
      lessons: [
        [
          "Seeing like a designer",
          "Design starts with a purpose. Before choosing colors or drawing a layout, identify the audience and the action you want them to take. A clear purpose helps you decide what belongs on the page and what can be removed.\n\nLook at a familiar website or poster. Notice which element you see first, where your eye travels next, and what makes the message feel clear. These observations reveal how visual hierarchy guides attention.\n\nPractice: choose a public information poster and list its three most important messages in order. Does the visual presentation support that order?",
        ],
        [
          "Balance and visual hierarchy",
          "Hierarchy gives information a clear order. Size, contrast, position, and whitespace can all signal importance. A headline might be larger than body text, while a call to action stands out through color or spacing.\n\nBalance does not require symmetry. Several smaller elements can balance a larger image, and an intentionally empty area can create focus. Aim for a composition that feels stable while supporting the content.\n\nPractice: sketch two arrangements for the same headline, image, and paragraph. Compare where each arrangement directs your attention.",
        ],
        [
          "A purposeful color palette",
          "Start with a neutral foundation and a small set of functional colors. Give each accent a role, such as showing an action or communicating status. Consistency makes a palette useful.\n\nColor alone should never carry essential information. Pair it with a label, icon, or pattern, and check that text has sufficient contrast against its background. Accessible color choices make your design useful to more people.",
        ],
        [
          "Typography that communicates",
          "A type scale creates a repeatable hierarchy for headings, labels, and body text. Use a small number of sizes and weights, and choose line spacing that makes paragraphs easy to scan.\n\nReadable text depends on more than font choice. Line length, contrast, spacing, and the language itself all matter. Test your layout with real content rather than idealized placeholder text.",
        ],
        [
          "From brief to first concept",
          "A strong brief describes the audience, goal, constraints, and success criteria. Turn those requirements into several quick concepts before investing time in detail.\n\nShare your concepts early. Ask reviewers to explain what they understand and what they would do next. Use their observations to refine the design against the brief.",
        ],
        [
          "Critique and iteration",
          "A useful critique connects an observation to a goal: “The registration link is difficult to find, which may prevent visitors from signing up.” Specific feedback makes the next change clearer.\n\nDocument what changed and why. Iteration is a sequence of informed decisions, and recording those decisions helps you explain your work and evaluate its results.",
        ],
      ],
      quiz: [
        {
          prompt:
            "Which principle helps a reader identify the most important information first?",
          options: [
            "Visual hierarchy",
            "File compression",
            "Decoration",
            "Random variation",
          ],
          answer: "Visual hierarchy",
        },
        {
          prompt: "Color should be the only way to communicate an error.",
          type: "true-false",
          options: ["True", "False"],
          answer: "False",
        },
        {
          prompt:
            "What term describes the empty space around elements in a layout?",
          type: "short-answer",
          answer: "whitespace",
        },
      ],
    },
    {
      id: "web",
      title: "Web development",
      code: "WEB201",
      category: "Technology",
      cover: "code",
      color: "#dce6ed",
      status: "published",
      description:
        "Bring ideas to the browser with semantic HTML, responsive CSS, and JavaScript. Build accessible, useful experiences for the modern web.",
      modules: [
        "Structure with HTML",
        "Responsive styling",
        "JavaScript in the browser",
      ],
      lessons: [
        [
          "How the web works",
          "A browser requests a resource from a server using HTTP. The response can contain HTML, CSS, JavaScript, or another type of content. The browser uses these resources to construct and display a page.\n\nThe URL identifies a resource, while status codes describe the result of a request. Understanding this request and response cycle helps you diagnose missing content and application errors.",
        ],
        [
          "Writing semantic HTML",
          "HTML describes the structure and meaning of content. Use headings in a logical order, buttons for actions, links for navigation, and labels for form controls.\n\nSemantic elements give browsers and assistive technology information about your interface. Choose an element for its purpose first, then use CSS to control its appearance.",
        ],
        [
          "Layout with CSS",
          "CSS Grid works well for two-dimensional page layouts, while Flexbox is useful for arranging items along a row or column. Both reduce the need for brittle positioning rules.\n\nStart with the natural flow of content and add layout constraints intentionally. Check long headings, empty states, and translated text as well as typical examples.",
        ],
        [
          "Responsive interfaces",
          "Responsive design adapts to the available space. Use flexible widths, sensible minimum sizes, and breakpoints where the content needs them.\n\nTest at narrow and wide viewport sizes, and make sure controls remain usable with touch and keyboard input. A layout should preserve the priority of content as its arrangement changes.",
        ],
        [
          "Events and state",
          "An event handler responds to an interaction such as a click or form submission. Application state holds information that determines what the interface displays.\n\nKeep updates predictable: validate input, update the state, and display success or failure clearly. Avoid relying on a visual change alone when an action needs feedback.",
        ],
        [
          "Fetching and handling data",
          "The fetch API sends HTTP requests and returns a promise. Check the response status before using its content, and handle network failures explicitly.\n\nA robust interface accounts for loading, empty, success, and error states. Let users retry a failed operation without losing the information they entered.",
        ],
      ],
      quiz: [
        {
          prompt:
            "Which HTML element is most appropriate for submitting a form?",
          options: ["button", "span", "div", "section"],
          answer: "button",
        },
        {
          prompt:
            "A responsive layout should adapt to different viewport widths.",
          type: "true-false",
          options: ["True", "False"],
          answer: "True",
        },
        {
          prompt: "Which browser API is commonly used to make HTTP requests?",
          type: "short-answer",
          answer: "fetch",
        },
      ],
    },
    {
      id: "marketing",
      title: "Digital marketing",
      code: "MKT101",
      category: "Marketing",
      cover: "marketing",
      color: "#f0e3d7",
      status: "published",
      description:
        "Connect thoughtful strategy with measurable results. Learn to understand your audience, plan campaigns, and improve performance.",
      modules: [
        "Know your audience",
        "Build your campaign",
        "Measure what matters",
      ],
      lessons: [
        [
          "Audience needs and research",
          "Begin with the people you want to reach. Learn what they are trying to accomplish, the obstacles they face, and where they look for information. Interviews and existing support questions are useful starting points.\n\nSeparate observations from assumptions. A useful audience profile summarizes evidence and leaves room for new findings.",
        ],
        [
          "Defining a clear objective",
          "An effective campaign has a specific outcome. “Increase completed trial registrations by 10 percent this month” is more useful than “get more engagement.”\n\nChoose a measure that is close to the desired outcome, identify a baseline, and define a time period. These decisions guide channel selection and creative work.",
        ],
        [
          "Channels and content",
          "Choose channels based on audience behavior and the kind of message you need to communicate. Search, email, and social media have different strengths and costs.\n\nContent should answer a useful question or help someone take a next step. Adapt the presentation to the channel while keeping the core message consistent.",
        ],
        [
          "Planning a campaign",
          "A campaign plan connects the objective, audience, message, channels, schedule, and budget. Assign an owner to each deliverable and check dependencies before launch.\n\nUse a simple calendar to coordinate assets and publishing dates. Leave time to review accessibility, tracking, and the destination experience.",
        ],
        [
          "Conversion and attribution",
          "A conversion is a defined action that supports the campaign objective. A conversion rate divides completed actions by the relevant number of opportunities.\n\nAttribution assigns credit to touchpoints, but each model has limitations. Avoid interpreting one dashboard as a complete explanation of customer behavior.",
        ],
        [
          "Learning from experiments",
          "Write a hypothesis before running an experiment. Change one important factor, define a primary measure, and collect enough observations to support a decision.\n\nAn inconclusive result is still useful when it narrows uncertainty. Record the context and follow-up questions alongside the headline outcome.",
        ],
      ],
      quiz: [
        {
          prompt: "Which goal is most useful for evaluating a campaign?",
          options: [
            "Increase completed registrations by 10% this month",
            "Be more popular",
            "Post everywhere",
            "Use brighter colors",
          ],
          answer: "Increase completed registrations by 10% this month",
        },
        {
          prompt: "A campaign should define its success measure before launch.",
          type: "true-false",
          options: ["True", "False"],
          answer: "True",
        },
        {
          prompt:
            "What is the term for a desired action completed by a visitor?",
          type: "short-answer",
          answer: "conversion",
        },
      ],
    },
    {
      id: "photo",
      title: "Photography",
      code: "PHO101",
      category: "Creative arts",
      cover: "photo",
      color: "#e9e2ed",
      status: "published",
      description:
        "Tell a story through your lens. Develop confidence with exposure, composition, natural light, and a considered editing process.",
      modules: [
        "Meet your camera",
        "Light and composition",
        "Your visual story",
      ],
      lessons: [
        [
          "The exposure triangle",
          "Aperture, shutter speed, and ISO work together to determine exposure. Aperture affects depth of field, shutter speed affects motion, and ISO affects how the camera amplifies its signal.\n\nPractice by photographing the same scene with different settings. Notice both the brightness and the creative effect of each change.",
        ],
        [
          "Focus and depth of field",
          "Focus determines which distance appears sharp. Depth of field describes the range that appears acceptably sharp around that distance.\n\nA wider aperture often produces a shallower depth of field. Subject distance and focal length also matter, so test settings with the composition you actually want.",
        ],
        [
          "Working with natural light",
          "Observe the direction, intensity, and softness of light before choosing your position. Window light and open shade can provide a gentle starting point for portraits.\n\nMove the subject or camera to change the relationship between light and shadow. Small changes can have a large effect on the mood of an image.",
        ],
        [
          "Composition and visual rhythm",
          "Composition organizes the frame. Lines, shapes, repetition, negative space, and contrast can lead attention toward your subject.\n\nGuidelines such as the rule of thirds are starting points, not requirements. Ask whether each element in the frame contributes to the intended story.",
        ],
        [
          "Editing with intention",
          "Begin by selecting images that support your story. Make basic exposure, white balance, and crop adjustments before adding stylistic effects.\n\nKeep an original file and work nondestructively where possible. Review the final image at both full size and its intended display size.",
        ],
        [
          "Building a photo essay",
          "A photo essay uses a sequence of images to communicate an idea. Include a sense of place, meaningful details, and images that connect the sequence.\n\nEdit for clarity rather than quantity. A concise set of images with a clear relationship is often stronger than a large collection of similar frames.",
        ],
      ],
      quiz: [
        {
          prompt:
            "Which setting most directly controls how motion appears in a photograph?",
          options: [
            "Shutter speed",
            "File name",
            "White balance",
            "Image rating",
          ],
          answer: "Shutter speed",
        },
        {
          prompt:
            "Composition guidelines are useful starting points rather than absolute rules.",
          type: "true-false",
          options: ["True", "False"],
          answer: "True",
        },
        {
          prompt:
            "Which exposure setting is commonly expressed as an f-number?",
          type: "short-answer",
          answer: "aperture",
        },
      ],
    },
    {
      id: "business",
      title: "Business strategy",
      code: "BUS201",
      category: "Business",
      cover: "business",
      color: "#e8e6cf",
      status: "draft",
      description:
        "Make better strategic choices. Explore value propositions, competitive positioning, and the practical decisions that shape sustainable growth.",
      modules: [
        "A strategic foundation",
        "Choose where to compete",
        "Turn strategy into action",
      ],
      lessons: [
        [
          "Strategy as a set of choices",
          "Strategy explains where an organization will focus and how it expects to create value. It requires choices about customers, capabilities, and activities.\n\nA useful strategy also clarifies what the organization will not pursue. These boundaries help teams make consistent decisions when opportunities compete.",
        ],
        [
          "Understanding value",
          "A value proposition describes the benefit a customer receives and why the offer is relevant to their situation. It should connect to a real need rather than a list of features.\n\nTest your assumptions with customer evidence. Look for the language customers use to describe the problem and the alternatives they already use.",
        ],
        [
          "Competitive positioning",
          "Positioning defines how an offer fits among available alternatives. Compare the factors customers care about, not only the features competitors advertise.\n\nDifferent customers can value different tradeoffs. Focus makes it easier to provide a distinctive and coherent experience.",
        ],
        [
          "Capabilities and constraints",
          "A strategy must fit the capabilities an organization can develop and sustain. Identify the skills, processes, relationships, and resources that support the chosen direction.\n\nConstraints can reveal useful priorities. Decide which gaps matter most and which can be addressed through partnerships or a narrower scope.",
        ],
        [
          "Objectives and initiatives",
          "Translate strategic choices into a small set of measurable objectives. Initiatives describe the work intended to move those measures.\n\nAssign ownership and a review cadence. Separate progress on an initiative from evidence that the strategy is achieving its intended result.",
        ],
        [
          "Reviewing and adapting",
          "Strategy reviews should examine assumptions as well as results. A change in customer behavior or operating conditions may require a different response.\n\nDocument what you learned and which decision it changes. Adaptation works best when teams understand the reason behind the new direction.",
        ],
      ],
      quiz: [
        {
          prompt: "A useful strategy primarily describes:",
          options: [
            "Choices about where and how to create value",
            "Every possible initiative",
            "A list of slogans",
            "Only last year’s revenue",
          ],
          answer: "Choices about where and how to create value",
        },
        {
          prompt: "A value proposition should connect to a customer need.",
          type: "true-false",
          options: ["True", "False"],
          answer: "True",
        },
        {
          prompt:
            "Explain one tradeoff a business might make when choosing a target audience.",
          type: "essay",
        },
      ],
    },
    {
      id: "data",
      title: "Data storytelling",
      code: "DAT201",
      category: "Data & analytics",
      cover: "data",
      color: "#d9e7e3",
      status: "draft",
      description:
        "Turn information into understanding. Find a clear narrative, choose effective charts, and communicate insights with care and confidence.",
      modules: [
        "Start with the question",
        "Build an honest visual",
        "Present the insight",
      ],
      lessons: [
        [
          "Questions before charts",
          "Start with the decision or question your audience needs to understand. This gives the analysis a purpose and helps you identify relevant data.\n\nCheck where the data came from, what each field means, and which observations might be missing. Clear definitions prevent confident but misleading conclusions.",
        ],
        [
          "Exploring the data",
          "Inspect distributions, ranges, missing values, and unusual observations before summarizing a dataset. A single average can hide important differences.\n\nRecord assumptions and transformations as you work. A reproducible process makes it easier to explain the result and investigate questions later.",
        ],
        [
          "Choosing a chart",
          "Choose a chart based on the relationship you want to show. Bars support comparisons, lines show change over an ordered sequence, and scatterplots show relationships between numerical variables.\n\nUse labels and scales that help readers interpret the values. A familiar chart with a clear message often communicates more effectively than an elaborate design.",
        ],
        [
          "Context and uncertainty",
          "A number becomes useful when readers understand its context. Include relevant baselines, time periods, sample sizes, and definitions.\n\nUncertainty should be visible when it affects the conclusion. Explain limitations in plain language and avoid implying precision the data does not support.",
        ],
        [
          "A narrative with evidence",
          "Organize the story around the question, the evidence, and the implication. Each visual should help the audience make one useful comparison or inference.\n\nUse a descriptive title that states what the chart shows. Keep the evidence distinct from your interpretation so readers can assess the reasoning.",
        ],
        [
          "Presenting and inviting questions",
          "Adapt the level of detail to the audience and the decision. Lead with the main finding, then provide supporting evidence and limitations.\n\nInvite questions about assumptions and alternative explanations. A good data story helps people reason together rather than simply accept a conclusion.",
        ],
      ],
      quiz: [
        {
          prompt:
            "Which chart is usually appropriate for comparing values across categories?",
          options: [
            "Bar chart",
            "Decorative illustration",
            "Unlabeled map",
            "Random scatter",
          ],
          answer: "Bar chart",
        },
        {
          prompt:
            "Uncertainty should be communicated when it affects a conclusion.",
          type: "true-false",
          options: ["True", "False"],
          answer: "True",
        },
        {
          prompt:
            "Explain why a chart should include relevant context and limitations.",
          type: "essay",
        },
      ],
    },
  ];

  for (const def of definitions) {
    store.put("courses", {
      id: def.id,
      title: def.title,
      code: def.code,
      description: def.description,
      category: def.category,
      color: def.color,
      status: def.status,
      cover: def.cover,
      startDate: date(-30).slice(0, 10),
      endDate: date(60).slice(0, 10),
      pace:
        def.id === "web" || def.id === "business"
          ? "instructor-led"
          : "self-paced",
      enrollment: "open",
      passingScore: 70,
      prerequisites: def.id === "web" || def.id === "data" ? ["design"] : [],
      weights: { quizzes: 40, assignments: 40, participation: 20 },
      createdAt: date(-60),
    });
  }

  const people = [
    ["instructor", "Alex Morgan", "alex@meridian.example", "instructor"],
    ["learner", "Jamie Chen", "jamie@meridian.example", "learner"],
    ["learner-2", "Sofia Rodriguez", "sofia@meridian.example", "learner"],
    ["learner-3", "Noah Williams", "noah@meridian.example", "learner"],
    ["learner-4", "Amara Okafor", "amara@meridian.example", "learner"],
    ["learner-5", "Liam Patel", "liam@meridian.example", "learner"],
    ["learner-6", "Emma Thompson", "emma@meridian.example", "learner"],
    ["learner-7", "Oliver Kim", "oliver@meridian.example", "learner"],
    ["learner-8", "Isabella Rossi", "isabella@meridian.example", "learner"],
    ["learner-9", "Ethan Nguyen", "ethan@meridian.example", "learner"],
    ["learner-10", "Mia Hassan", "mia@meridian.example", "learner"],
    ["learner-11", "Lucas Silva", "lucas@meridian.example", "learner"],
    ["learner-12", "Ava Martinez", "ava@meridian.example", "learner"],
    ["learner-13", "Leo Andersen", "leo@meridian.example", "learner"],
    ["learner-14", "Zara Ali", "zara@meridian.example", "learner"],
    ["learner-15", "Henry Wilson", "henry@meridian.example", "learner"],
    ["learner-16", "Chloe Dubois", "chloe@meridian.example", "learner"],
  ];
  for (const [id, name, email, role] of people)
    store.put("users", { id, name, email, role, createdAt: date(-65) });

  for (const [ci, def] of definitions.entries()) {
    for (const [mi, title] of def.modules.entries()) {
      const moduleId = `${def.id}-module-${mi + 1}`;
      store.put("modules", {
        id: moduleId,
        courseId: def.id,
        title,
        position: mi,
      });
      for (let li = 0; li < 2; li++) {
        const lesson = def.lessons[mi * 2 + li];
        store.put("items", {
          id: `${def.id}-lesson-${mi * 2 + li + 1}`,
          courseId: def.id,
          moduleId,
          title: lesson[0],
          type: "lesson",
          content: lesson[1],
          position: li,
        });
      }
    }
    const quizId = `${def.id}-quiz-1`;
    store.put("quizzes", {
      id: quizId,
      courseId: def.id,
      title: `${def.title}: knowledge check`,
      description:
        "Check your understanding of the key ideas. Take your time, read each question carefully, and use the feedback to plan your next steps.",
      timeLimit: 20,
      attempts: 3,
      passingScore: 70,
      published: def.status === "published",
      questions: def.quiz.map((question, index) => ({
        id: `${def.id}-q${index + 1}`,
        type: question.type || "multiple-choice",
        options: question.options || [],
        answer: question.answer || "",
        points: question.type === "essay" ? 20 : 10,
        ...question,
      })),
      createdAt: date(-28),
    });
    store.put("items", {
      id: `${def.id}-quiz-item`,
      courseId: def.id,
      moduleId: `${def.id}-module-3`,
      title: "Knowledge check",
      type: "quiz",
      quizId,
      position: 3,
    });
    store.put("items", {
      id: `${def.id}-assignment`,
      courseId: def.id,
      moduleId: `${def.id}-module-3`,
      title: "Final project: apply what you learned",
      type: "assignment",
      content: `Create a short project that applies the main ideas from ${def.title.toLowerCase()}. Include a brief explanation of your goal, the decisions you made, and what you would improve next. Share your work with your instructor through the agreed course channel for feedback.`,
      dueDate: date(7 + ci),
      position: 4,
    });
    if (def.status !== "published") continue;
    for (let pi = 1; pi < people.length; pi++) {
      if (ci === 1 && pi === 1) continue; // Demo learner can exercise the prerequisite gate.
      if (ci === 2 && pi % 3 === 0) continue;
      if (ci === 3 && pi % 2 === 0) continue;
      const userId = people[pi][0];
      const base = 59 + ((pi * 7 + ci * 13) % 39);
      const completed =
        pi !== 1 && (ci === 0 ? pi % 4 !== 0 : (pi + ci) % 3 === 0);
      store.put("enrollments", {
        id: `${def.id}:${userId}`,
        courseId: def.id,
        userId,
        completed,
        grades: {
          quizzes: base,
          assignments: Math.min(100, base + 3),
          participation: Math.min(100, base + 7),
        },
        createdAt: date(-28 + (pi % 6)),
        completedAt: completed ? date(-pi % 6) : null,
      });
    }
  }

  const published = definitions.filter(
    (course) => course.status === "published",
  );
  for (let day = 6; day >= 0; day--) {
    const count = [5, 7, 6, 9, 11, 8, 6][6 - day];
    for (let index = 0; index < count; index++) {
      const course = published[(day + index) % published.length];
      const person = people[1 + ((day * 3 + index) % (people.length - 1))];
      const type = ["completion", "quiz", "enrollment", "lesson"][index % 4];
      const text =
        type === "completion"
          ? "completed a learning module"
          : type === "quiz"
            ? "submitted a knowledge check"
            : type === "enrollment"
              ? "joined the course"
              : "continued their learning journey";
      store.put("activities", {
        id: `seed-activity-${day}-${index}`,
        type,
        text,
        courseId: course.id,
        userId: person[0],
        createdAt: date(-day, -(index + 1)),
      });
    }
  }
  store.put("activities", {
    id: "seed-course-update",
    type: "course",
    text: "updated the course learning materials",
    courseId: "design",
    userId: "instructor",
    createdAt: date(0, -0.2),
  });
}
