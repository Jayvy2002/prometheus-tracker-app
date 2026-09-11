/** Version-one standard identifiers and stored values. Never repurpose an existing ID. */
export interface StandardQuestion {
 id:string; maps_to:string; label:{fr:string;en:string};
 type:'text'|'number'|'single'|'multi'|'yes_no'|'weekdays';
 required:boolean; medical:boolean;
 options?:Array<{id:string;label:{fr:string;en:string}}>;
}
export const STANDARD_QUESTION_ORDER = ["nom","prenom","age","sexeGenre","tailleCm","poidsApproxKg","objectifPrincipal","depuisCombienDeTemps","niveauActuel","foisParSemaine","programmeStructure","seancesRealistes","dureeIdeale","lieu","equipement","douleursLimitations","mouvementAEviter","blessuresChirurgies","descriptionBlessures","cardiaqueHtaPoitrine","etourdissementsEquilibre","medecinLimiteExercices","conditionMedicalePrecise","typesExercices","exercicesDetestes","prefereProgramme","quelqueChoseImportant"];
export const STANDARD_QUESTIONS:Record<string,StandardQuestion> = {
  "age": {
    "id": "age",
    "label": {
      "en": "Age",
      "fr": "Age"
    },
    "maps_to": "age",
    "medical": false,
    "required": false,
    "type": "number"
  },
  "blessuresChirurgies": {
    "id": "blessuresChirurgies",
    "label": {
      "en": "Have you had any major injuries, surgeries, or operations?",
      "fr": "As-tu déjà eu des blessures importantes, des chirurgies ou opérations quelconques ?"
    },
    "maps_to": "blessuresChirurgies",
    "medical": true,
    "required": false,
    "type": "yes_no"
  },
  "cardiaqueHtaPoitrine": {
    "id": "cardiaqueHtaPoitrine",
    "label": {
      "en": "Heart condition, uncontrolled hypertension, or chest pain during effort?",
      "fr": "Condition cardiaque, hypertension non contrôlée, ou douleurs à la poitrine à l'effort ?"
    },
    "maps_to": "cardiaqueHtaPoitrine",
    "medical": true,
    "required": false,
    "type": "yes_no"
  },
  "conditionMedicalePrecise": {
    "id": "conditionMedicalePrecise",
    "label": {
      "en": "Specific medical condition (if yes to any of the previous answers)",
      "fr": "Condition médicale précise (si oui à l'une des réponses précédentes)"
    },
    "maps_to": "conditionMedicalePrecise",
    "medical": true,
    "required": false,
    "type": "text"
  },
  "depuisCombienDeTemps": {
    "id": "depuisCombienDeTemps",
    "label": {
      "en": "How long have you been pursuing this goal?",
      "fr": "Depuis combien de temps poursuis-tu cet objectif?"
    },
    "maps_to": "depuisCombienDeTemps",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "descriptionBlessures": {
    "id": "descriptionBlessures",
    "label": {
      "en": "Description of the injury(ies) / surgery(ies) / operation(s) (if yes)",
      "fr": "Description de la ou des blessure(s) / chirurgie(s) / opération(s) (si oui)"
    },
    "maps_to": "descriptionBlessures",
    "medical": true,
    "required": false,
    "type": "text"
  },
  "douleursLimitations": {
    "id": "douleursLimitations",
    "label": {
      "en": "Do you currently have pain or limitations that affect your movement?",
      "fr": "As-tu actuellement des douleurs ou limitations qui affectent tes mouvements ?"
    },
    "maps_to": "douleursLimitations",
    "medical": true,
    "required": false,
    "type": "yes_no"
  },
  "dureeIdeale": {
    "id": "dureeIdeale",
    "label": {
      "en": "Ideal session length",
      "fr": "Durée idéale d'une séance"
    },
    "maps_to": "dureeIdeale",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "30 min",
          "fr": "30 mins"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "45–60 min",
          "fr": "45-60 mins"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "60–75 min",
          "fr": "60-75 mins"
        }
      },
      {
        "id": "o3",
        "label": {
          "en": "90+ min",
          "fr": "90+ mins"
        }
      }
    ],
    "required": false,
    "type": "single"
  },
  "equipement": {
    "id": "equipement",
    "label": {
      "en": "Available equipment (multiple choices)",
      "fr": "Équipement disponible (plusieurs choix possibles)"
    },
    "maps_to": "equipement",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "Dumbbells",
          "fr": "Haltères libres"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "Barbell",
          "fr": "Barre"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "Rack",
          "fr": "Rack"
        }
      },
      {
        "id": "o3",
        "label": {
          "en": "Bench",
          "fr": "Banc"
        }
      },
      {
        "id": "o4",
        "label": {
          "en": "Machines",
          "fr": "Machines"
        }
      },
      {
        "id": "o5",
        "label": {
          "en": "Câbles",
          "fr": "Câbles"
        }
      },
      {
        "id": "o6",
        "label": {
          "en": "Resistance bands",
          "fr": "Bandes élastiques"
        }
      },
      {
        "id": "o7",
        "label": {
          "en": "Kettlebells",
          "fr": "Kettlebells"
        }
      },
      {
        "id": "o8",
        "label": {
          "en": "Pull-up bar",
          "fr": "Barre de traction"
        }
      },
      {
        "id": "o9",
        "label": {
          "en": "Indoor bike",
          "fr": "Vélo intérieur"
        }
      },
      {
        "id": "o10",
        "label": {
          "en": "Treadmill",
          "fr": "Tapis"
        }
      },
      {
        "id": "o11",
        "label": {
          "en": "Rower",
          "fr": "Rameur"
        }
      },
      {
        "id": "o12",
        "label": {
          "en": "Squat machine",
          "fr": "Appareil à squat"
        }
      },
      {
        "id": "o13",
        "label": {
          "en": "Bodyweight only",
          "fr": "Poids du corps seulement"
        }
      },
      {
        "id": "o14",
        "label": {
          "en": "Other",
          "fr": "Autre"
        }
      }
    ],
    "required": false,
    "type": "multi"
  },
  "etourdissementsEquilibre": {
    "id": "etourdissementsEquilibre",
    "label": {
      "en": "Dizziness, loss of balance, or unusual shortness of breath?",
      "fr": "Étourdissements, pertes d'équilibre ou essoufflement inhabituel ?"
    },
    "maps_to": "etourdissementsEquilibre",
    "medical": true,
    "required": false,
    "type": "yes_no"
  },
  "exercicesDetestes": {
    "id": "exercicesDetestes",
    "label": {
      "en": "Any exercises you hate or absolutely want to avoid?",
      "fr": "Des exercices que tu détestes ou que tu veux absolument éviter ?"
    },
    "maps_to": "exercicesDetestes",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "foisParSemaine": {
    "id": "foisParSemaine",
    "label": {
      "en": "How many times per week?",
      "fr": "Combien de fois par semaine?"
    },
    "maps_to": "foisParSemaine",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "1-2",
          "fr": "1-2"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "3-4",
          "fr": "3-4"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "5-6",
          "fr": "5-6"
        }
      },
      {
        "id": "o3",
        "label": {
          "en": "7+",
          "fr": "7+"
        }
      }
    ],
    "required": false,
    "type": "single"
  },
  "lieu": {
    "id": "lieu",
    "label": {
      "en": "Where do you mainly train?",
      "fr": "Où t'entraînes-tu principalement ?"
    },
    "maps_to": "lieu",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "Home",
          "fr": "Domicile"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "Gym",
          "fr": "Salle"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "Both",
          "fr": "Mixte"
        }
      },
      {
        "id": "o3",
        "label": {
          "en": "Extérieur",
          "fr": "Extérieur"
        }
      }
    ],
    "required": false,
    "type": "single"
  },
  "medecinLimiteExercices": {
    "id": "medecinLimiteExercices",
    "label": {
      "en": "Has a doctor ever recommended that you limit certain exercises?",
      "fr": "Un médecin t'a-t-il déjà recommandé de limiter certains exercices ?"
    },
    "maps_to": "medecinLimiteExercices",
    "medical": true,
    "required": false,
    "type": "yes_no"
  },
  "mouvementAEviter": {
    "id": "mouvementAEviter",
    "label": {
      "en": "Description of the movement to avoid (if yes)",
      "fr": "Description du mouvement à éviter (si oui)"
    },
    "maps_to": "mouvementAEviter",
    "medical": true,
    "required": false,
    "type": "text"
  },
  "niveauActuel": {
    "id": "niveauActuel",
    "label": {
      "en": "What is your current level?",
      "fr": "Quel est ton niveau actuel?"
    },
    "maps_to": "niveauActuel",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "Beginner (less than 6–12 months of consistent training)",
          "fr": "Débutant (moins de 6-12 mois réguliers)"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "Intermédiaire",
          "fr": "Intermédiaire"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "Avancé",
          "fr": "Avancé"
        }
      }
    ],
    "required": false,
    "type": "single"
  },
  "nom": {
    "id": "nom",
    "label": {
      "en": "Last name",
      "fr": "Nom"
    },
    "maps_to": "nom",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "objectifPrincipal": {
    "id": "objectifPrincipal",
    "label": {
      "en": "What is your main goal",
      "fr": "Quel est ton objectif principal"
    },
    "maps_to": "objectifPrincipal",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "poidsApproxKg": {
    "id": "poidsApproxKg",
    "label": {
      "en": "Approximate weight (kg)",
      "fr": "Poids approximatif (kg)"
    },
    "maps_to": "poidsApproxKg",
    "medical": false,
    "required": false,
    "type": "number"
  },
  "prefereProgramme": {
    "id": "prefereProgramme",
    "label": {
      "en": "Do you prefer a program?",
      "fr": "Préfères-tu un programme ?"
    },
    "maps_to": "prefereProgramme",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "prenom": {
    "id": "prenom",
    "label": {
      "en": "First name",
      "fr": "Prénom"
    },
    "maps_to": "prenom",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "programmeStructure": {
    "id": "programmeStructure",
    "label": {
      "en": "Have you already followed a structured program?",
      "fr": "As-tu déjà suivi un programme structuré?"
    },
    "maps_to": "programmeStructure",
    "medical": false,
    "required": false,
    "type": "yes_no"
  },
  "quelqueChoseImportant": {
    "id": "quelqueChoseImportant",
    "label": {
      "en": "Is there anything important I should absolutely know?",
      "fr": "Y a-t-il quelque chose d'important que je devrais absolument savoir ?"
    },
    "maps_to": "quelqueChoseImportant",
    "medical": false,
    "required": false,
    "type": "text"
  },
  "seancesRealistes": {
    "id": "seancesRealistes",
    "label": {
      "en": "How many sessions per week can you realistically do?",
      "fr": "Combien de séances par semaine peux-tu réalistement faire?"
    },
    "maps_to": "seancesRealistes",
    "medical": false,
    "required": false,
    "type": "number"
  },
  "sexeGenre": {
    "id": "sexeGenre",
    "label": {
      "en": "Sex / gender",
      "fr": "Sexe/Genre"
    },
    "maps_to": "sexeGenre",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "F",
          "fr": "F"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "M",
          "fr": "H"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "Other",
          "fr": "Autre"
        }
      }
    ],
    "required": false,
    "type": "single"
  },
  "tailleCm": {
    "id": "tailleCm",
    "label": {
      "en": "Height (cm)",
      "fr": "Taille (cm)"
    },
    "maps_to": "tailleCm",
    "medical": false,
    "required": false,
    "type": "number"
  },
  "typesExercices": {
    "id": "typesExercices",
    "label": {
      "en": "Which types of exercises do you prefer?",
      "fr": "Quels types d'exercices préfères-tu ?"
    },
    "maps_to": "typesExercices",
    "medical": false,
    "options": [
      {
        "id": "o0",
        "label": {
          "en": "Free weights (dumbbells / barbell)",
          "fr": "Charges libres (haltères / barre)"
        }
      },
      {
        "id": "o1",
        "label": {
          "en": "Machines",
          "fr": "Machines"
        }
      },
      {
        "id": "o2",
        "label": {
          "en": "Bodyweight",
          "fr": "Poids du corps"
        }
      },
      {
        "id": "o3",
        "label": {
          "en": "Unilateral / stability",
          "fr": "Unilatéral / Stabilité"
        }
      },
      {
        "id": "o4",
        "label": {
          "en": "Circuits / more dynamic",
          "fr": "Circuits / Plus dynamique"
        }
      },
      {
        "id": "o5",
        "label": {
          "en": "Doesn't matter, I adapt",
          "fr": "Peu importe je m'adapte"
        }
      },
      {
        "id": "o6",
        "label": {
          "en": "Other",
          "fr": "Autre"
        }
      }
    ],
    "required": false,
    "type": "multi"
  }
};
const STORED_OPTIONS:Record<string,Record<string,string>> = {
  "dureeIdeale": {
    "o0": "30 mins",
    "o1": "45-60 mins",
    "o2": "60-75 mins",
    "o3": "90+ mins"
  },
  "equipement": {
    "o0": "Haltères libres",
    "o1": "Barre",
    "o10": "Tapis",
    "o11": "Rameur",
    "o12": "Appareil à squat",
    "o13": "Poids du corps seulement",
    "o14": "Autre",
    "o2": "Rack",
    "o3": "Banc",
    "o4": "Machines",
    "o5": "Câbles",
    "o6": "Bandes élastiques",
    "o7": "Kettlebells",
    "o8": "Barre de traction",
    "o9": "Vélo intérieur"
  },
  "foisParSemaine": {
    "o0": "1-2",
    "o1": "3-4",
    "o2": "5-6",
    "o3": "7+"
  },
  "lieu": {
    "o0": "Domicile",
    "o1": "Salle",
    "o2": "Mixte",
    "o3": "Extérieur"
  },
  "niveauActuel": {
    "o0": "Débutant (moins de 6-12 mois réguliers)",
    "o1": "Intermédiaire",
    "o2": "Avancé"
  },
  "sexeGenre": {
    "o0": "F",
    "o1": "H",
    "o2": "Autre"
  },
  "typesExercices": {
    "o0": "Charges libres (haltères / barre)",
    "o1": "Machines",
    "o2": "Poids du corps",
    "o3": "Unilatéral / Stabilité",
    "o4": "Circuits / Plus dynamique",
    "o5": "Peu importe je m'adapte",
    "o6": "Autre"
  }
};

/** Mapping is explicit and type-preserving; it never writes profile targets. */
export function mapStandardQuestionnaireAnswers(
 definition:{sections:Array<{questions:Array<{id:string;maps_to?:string;type:string}>}>},
 answers:Record<string,unknown>,
):Record<string,unknown> {
 const mapped:Record<string,unknown>={};
 for(const q of definition.sections.flatMap(s=>s.questions)){
  if(!q.maps_to||!Object.prototype.hasOwnProperty.call(STANDARD_QUESTIONS,q.maps_to))continue;
  const target=q.maps_to;
  const spec=STANDARD_QUESTIONS[target];
  if(q.type!==spec.type||!Object.prototype.hasOwnProperty.call(answers,q.id))continue;
  const value=answers[q.id];
  if(value==null||value==='')continue;
  if(spec.type==='yes_no'&&typeof value==='boolean')mapped[target]=value?'Oui':'Non';
  else if(spec.type==='number'&&typeof value==='number'&&Number.isFinite(value))mapped[target]=String(value);
  else if(spec.type==='text'&&typeof value==='string')mapped[target]=value;
  else if(spec.type==='single'&&typeof value==='string'&&Object.prototype.hasOwnProperty.call(STORED_OPTIONS[target],value))mapped[target]=STORED_OPTIONS[target][value];
  else if(spec.type==='multi'&&Array.isArray(value)&&value.every(v=>typeof v==='string'&&Object.prototype.hasOwnProperty.call(STORED_OPTIONS[target],v)))mapped[target]=value.map(v=>STORED_OPTIONS[target][v as string]);
 }
 return mapped;
}
