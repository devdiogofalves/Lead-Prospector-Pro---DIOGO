---
name: Dados4U API integration
description: Consulta de dados pessoais (CPF/CNPJ/nome/telefone/email) via API Dados4U
type: integration
---
- Endpoint: POST https://dados4u.com.br/api/v1/consultar
- Auth: header X-API-Key (secret DADOS4U_API_KEY)
- Body: { tipo: "cpf_cnpj"|"nome"|"telefone"|"email", valor: string }
- Resposta FLAT: nome_completo, cpf, cnpj, data_nasc, sexo, nome_mae, falecido(bool), situacao, ocupacao, renda, risco_credito
- Arrays: telefones_celulares/[numero,situacao], telefones_fixos, emails/[email], enderecos/[endereco_rua,bairro,cidade,estado,cep,tipo], sociedade/[razao_social,cnpj,participacao]
- Edge function: supabase/functions/dados4u-query
- Tabela: dados4u_consultas (todos os campos + raw_response em jsonb)
- UI: componente Dados4uSearch (aba DADOS4U no dashboard) — consulta manual + histórico.
