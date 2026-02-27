export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  title?: string;
}

export interface Experience {
  title: string;
  company: string;
  start_date: string;
  end_date?: string;
  current?: boolean;
  location?: string;
  description: string;
}

export interface Education {
  degree: string;
  institution: string;
  year: string;
  field?: string;
}

export interface Language {
  language: string;
  level: string;
}

export interface Skills {
  technical?: string[];
  soft?: string[];
  languages?: Language[];
}

export interface Certification {
  name: string;
  issuer?: string;
  year?: string;
}

export interface Project {
  name: string;
  description: string;
  url?: string;
}

export interface CvData {
  personal_info: PersonalInfo;
  summary?: string;
  experiences: Experience[];
  education: Education[];
  skills: Skills;
  certifications?: Certification[];
  projects?: Project[];
}
