export interface Lead {
  id: string;
  nomeEmpresa: string;
  telefone: string;
  endereco: string;
  site: string;
  rating: number;
  reviews: number;
  especialidades: string;
  disparo: 'Sim' | 'Não';
  dataDisparo?: string;
  mensagem?: string;
}

export type DisparoStatus = 'all' | 'sent' | 'pending';
