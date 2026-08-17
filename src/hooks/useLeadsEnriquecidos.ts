import { useMemo } from "react";
import { useEmpresasEnriquecidas } from "./useEmpresasEnriquecidas";
import { useLeads } from "./useLeads";
import { useLinkedInContacts } from "./useLinkedInContacts";
import { useInstagramContacts } from "./useInstagramContacts";

export interface LeadEnriquecido {
  key: string;
  empresa: string;
  cnpj: string | null;
  razaoSocial: string | null;
  porte: string | null;
  socios: string | null;
  // Maps
  telefoneMaps: string | null;
  enderecoMaps: string | null;
  ratingMaps: number | null;
  emailEmpresa: string | null;
  // LinkedIn
  linkedinNome: string | null;
  linkedinCargo: string | null;
  linkedinUrl: string | null;
  linkedinTelefone: string | null;
  linkedinEmail: string | null;
  // Instagram
  instagramUsername: string | null;
  instagramWhatsapp: string | null;
  instagramUrl: string | null;
  // Score
  score: number;
  channels: {
    cnpj: boolean;
    telefone: boolean;
    email: boolean;
    socios: boolean;
    linkedin: boolean;
    instagram: boolean;
    whatsappPessoal: boolean;
  };
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

export function useLeadsEnriquecidos() {
  const { empresas, isLoading: l1 } = useEmpresasEnriquecidas();
  const { leads, isLoading: l2 } = useLeads();
  const { contacts: linkedin, isLoading: l3 } = useLinkedInContacts();
  const { contacts: instagram, isLoading: l4 } = useInstagramContacts();

  const isLoading = l1 || l2 || l3 || l4;

  const enriquecidos: LeadEnriquecido[] = useMemo(() => {
    // Index by normalized company name
    const byName = new Map<string, LeadEnriquecido>();

    const upsert = (name: string): LeadEnriquecido => {
      const k = norm(name);
      let row = byName.get(k);
      if (!row) {
        row = {
          key: k,
          empresa: name,
          cnpj: null,
          razaoSocial: null,
          porte: null,
          socios: null,
          telefoneMaps: null,
          enderecoMaps: null,
          ratingMaps: null,
          emailEmpresa: null,
          linkedinNome: null,
          linkedinCargo: null,
          linkedinUrl: null,
          linkedinTelefone: null,
          linkedinEmail: null,
          instagramUsername: null,
          instagramWhatsapp: null,
          instagramUrl: null,
          score: 0,
          channels: {
            cnpj: false,
            telefone: false,
            email: false,
            socios: false,
            linkedin: false,
            instagram: false,
            whatsappPessoal: false,
          },
        };
        byName.set(k, row);
      }
      return row;
    };

    // Empresas enriquecidas → base principal (têm CNPJ)
    for (const e of empresas) {
      const r = upsert(e.nome_empresa);
      r.cnpj = r.cnpj || e.cnpj;
      r.razaoSocial = r.razaoSocial || e.razao_social || e.nome_fantasia;
      r.porte = r.porte || e.porte;
      r.socios = r.socios || e.socios;
      r.telefoneMaps = r.telefoneMaps || e.telefone;
      r.enderecoMaps = r.enderecoMaps || e.endereco;
      r.ratingMaps = r.ratingMaps ?? e.rating;
      r.emailEmpresa = r.emailEmpresa || e.email;
    }

    // Maps leads (extra fonte de telefone)
    for (const l of leads) {
      const r = upsert(l.nome_empresa);
      r.cnpj = r.cnpj || l.cnpj;
      r.razaoSocial = r.razaoSocial || l.razao_social;
      r.porte = r.porte || l.porte;
      r.socios = r.socios || l.socios;
      r.telefoneMaps = r.telefoneMaps || l.telefone;
      r.enderecoMaps = r.enderecoMaps || l.endereco;
    }

    // LinkedIn — cruza por empresa
    for (const c of linkedin) {
      if (!c.empresa) continue;
      const r = upsert(c.empresa);
      if (!r.linkedinNome) {
        r.linkedinNome = c.nome;
        r.linkedinCargo = c.cargo;
        r.linkedinUrl = c.linkedin_url;
        r.linkedinTelefone = c.telefone;
        r.linkedinEmail = c.email;
      }
    }

    // Instagram — cruza por nome (best-effort)
    for (const c of instagram) {
      const candidate = c.nome || c.username;
      if (!candidate) continue;
      const k = norm(candidate);
      const existing = byName.get(k);
      if (!existing) continue; // só vincula se já existe empresa com esse nome
      if (!existing.instagramUsername) {
        existing.instagramUsername = c.username;
        existing.instagramWhatsapp = c.whatsapp;
        existing.instagramUrl = c.profile_url;
      }
    }

    // Score
    for (const r of byName.values()) {
      r.channels.cnpj = !!r.cnpj;
      r.channels.telefone = !!r.telefoneMaps;
      r.channels.email = !!(r.emailEmpresa || r.linkedinEmail);
      r.channels.socios = !!r.socios;
      r.channels.linkedin = !!r.linkedinUrl;
      r.channels.instagram = !!r.instagramUsername;
      r.channels.whatsappPessoal = !!(r.linkedinTelefone || r.instagramWhatsapp);
      const filled = Object.values(r.channels).filter(Boolean).length;
      r.score = Math.round((filled / 7) * 100);
    }

    return Array.from(byName.values()).sort((a, b) => b.score - a.score);
  }, [empresas, leads, linkedin, instagram]);

  return { enriquecidos, isLoading };
}