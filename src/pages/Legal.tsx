import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const UPDATED_AT = "12 de julho de 2026";
const CONTACT_EMAIL = "nucledodameta@gmail.com";

type LegalSection = {
  title: string;
  paragraphs: string[];
  items?: string[];
};

type LegalPageProps = {
  title: string;
  description: string;
  sections: LegalSection[];
};

function LegalPage({ title, description, sections }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao LeadsBooster
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            LeadsBooster
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-primary">Documento público</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal sm:text-4xl">{title}</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{description}</p>
          <p className="mt-3 text-sm text-muted-foreground">Última atualização: {UPDATED_AT}</p>
        </div>

        <div className="mt-10 max-w-3xl space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold tracking-normal">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 font-medium text-foreground hover:text-primary"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {CONTACT_EMAIL}
          </a>
        </footer>
      </main>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Política de Privacidade"
      description="Esta política explica como a Núcleo da Automação, responsável pela plataforma LeadsBooster, trata dados pessoais e dados das contas conectadas pelos usuários."
      sections={[
        {
          title: "1. Dados que tratamos",
          paragraphs: [
            "Tratamos os dados informados no cadastro, dados necessários à autenticação, configurações da empresa e informações geradas durante o uso da plataforma.",
            "Quando o usuário conecta uma conta do Instagram, recebemos identificadores da conta, nome de usuário, token de acesso, conteúdos, comentários, mensagens e métricas estritamente conforme as permissões concedidas.",
          ],
        },
        {
          title: "2. Finalidades",
          paragraphs: ["Utilizamos os dados para operar, proteger e melhorar as funcionalidades contratadas."],
          items: [
            "Autenticar usuários e manter a sessão da conta.",
            "Publicar e gerenciar conteúdos autorizados pelo usuário.",
            "Exibir métricas, comentários e mensagens das contas conectadas.",
            "Executar automações configuradas pelo próprio usuário.",
            "Prevenir fraude, abuso e incidentes de segurança.",
            "Prestar suporte e cumprir obrigações legais.",
          ],
        },
        {
          title: "3. Compartilhamento",
          paragraphs: [
            "Não vendemos dados pessoais. Podemos utilizar provedores de infraestrutura, comunicação e inteligência artificial necessários à prestação do serviço, sempre limitados à finalidade contratada.",
            "Dados também poderão ser compartilhados quando houver obrigação legal, ordem de autoridade competente ou necessidade de proteção de direitos.",
          ],
        },
        {
          title: "4. Tokens e credenciais",
          paragraphs: [
            "A senha do Instagram não é armazenada pelo LeadsBooster. A autorização ocorre na interface oficial da Meta e recebemos um token de acesso revogável.",
            "Tokens são armazenados em ambiente protegido e utilizados apenas para executar ações autorizadas pelo titular da conta.",
          ],
        },
        {
          title: "5. Retenção e exclusão",
          paragraphs: [
            "Mantemos dados pelo período necessário à prestação do serviço, ao cumprimento de obrigações legais e à defesa de direitos. O usuário pode desconectar integrações ou solicitar a exclusão de seus dados.",
            "As instruções estão disponíveis em https://leadsbooster.com.br/exclusao-de-dados.",
          ],
        },
        {
          title: "6. Direitos do titular",
          paragraphs: [
            "O titular pode solicitar confirmação de tratamento, acesso, correção, portabilidade, informação sobre compartilhamento, revogação do consentimento e exclusão, observadas as hipóteses legais de retenção.",
          ],
        },
        {
          title: "7. Segurança e contato",
          paragraphs: [
            `Adotamos controles técnicos e organizacionais compatíveis com os riscos do serviço. Solicitações relacionadas à privacidade podem ser enviadas para ${CONTACT_EMAIL}.`,
          ],
        },
      ]}
    />
  );
}

export function TermsOfService() {
  return (
    <LegalPage
      title="Termos de Uso"
      description="Estes termos regulam o acesso e a utilização da plataforma LeadsBooster e de suas integrações."
      sections={[
        {
          title: "1. Aceitação",
          paragraphs: [
            "Ao criar uma conta ou utilizar o LeadsBooster, o usuário declara que leu e concorda com estes termos e com a Política de Privacidade.",
          ],
        },
        {
          title: "2. Conta e acesso",
          paragraphs: [
            "O usuário é responsável pela veracidade dos dados cadastrados, pela proteção de suas credenciais e pelas atividades realizadas em sua conta.",
            "As contas de redes sociais são conectadas por fluxos oficiais de autorização. O usuário deve possuir legitimidade para administrar cada conta conectada.",
          ],
        },
        {
          title: "3. Uso permitido",
          paragraphs: ["O LeadsBooster deve ser utilizado de forma lícita e em conformidade com as políticas das plataformas integradas."],
          items: [
            "Não enviar spam, conteúdo ilegal, enganoso ou abusivo.",
            "Não acessar dados ou contas sem autorização.",
            "Não contornar limites, controles de segurança ou regras das plataformas.",
            "Não utilizar automações para assédio, discriminação ou fraude.",
          ],
        },
        {
          title: "4. Conteúdo e automações",
          paragraphs: [
            "O usuário mantém a responsabilidade pelo conteúdo publicado, pelas mensagens enviadas e pelas regras de automação configuradas. Recursos de inteligência artificial podem produzir resultados imprecisos e devem ser revisados antes do uso.",
          ],
        },
        {
          title: "5. Disponibilidade e integrações",
          paragraphs: [
            "Podemos realizar manutenções e atualizações. Recursos dependentes de terceiros podem sofrer indisponibilidade, alteração de API ou mudança de política fora do controle do LeadsBooster.",
          ],
        },
        {
          title: "6. Suspensão e encerramento",
          paragraphs: [
            "O acesso poderá ser suspenso em caso de violação destes termos, risco à segurança, inadimplência ou determinação legal. O usuário pode solicitar o encerramento e a exclusão de dados conforme as instruções públicas.",
          ],
        },
        {
          title: "7. Contato",
          paragraphs: [`Dúvidas sobre estes termos podem ser enviadas para ${CONTACT_EMAIL}.`],
        },
      ]}
    />
  );
}

export function DataDeletion() {
  return (
    <LegalPage
      title="Exclusão de Dados"
      description="O usuário pode desconectar o Instagram e solicitar a exclusão dos dados associados à sua conta LeadsBooster."
      sections={[
        {
          title: "1. Desconectar o Instagram",
          paragraphs: [
            "Acesse Configurações, depois Canais, localize a conexão do Instagram e selecione a opção de desconexão. A autorização também pode ser removida nas configurações de aplicativos e sites da conta Meta.",
          ],
        },
        {
          title: "2. Solicitar exclusão completa",
          paragraphs: [
            `Envie um email para ${CONTACT_EMAIL} com o assunto “Exclusão de dados LeadsBooster”. Use o mesmo endereço de email cadastrado na plataforma e informe o nome de usuário do Instagram conectado.`,
            "Após a validação da titularidade, eliminaremos ou anonimizaremos os dados vinculados, exceto registros que precisem ser mantidos por obrigação legal, prevenção a fraude ou exercício regular de direitos.",
          ],
        },
        {
          title: "3. Prazo e confirmação",
          paragraphs: [
            "A solicitação será confirmada por email e processada em até 15 dias, salvo prazo diferente exigido por lei ou necessidade de informação adicional para validar a identidade do solicitante.",
          ],
        },
        {
          title: "4. Dados abrangidos",
          paragraphs: ["A exclusão abrange, conforme aplicável:"],
          items: [
            "Perfil e configurações da conta LeadsBooster.",
            "Tokens e identificadores das contas sociais conectadas.",
            "Conteúdos, mensagens, comentários e métricas armazenados pela plataforma.",
            "Automações, planejamentos e dados de relacionamento criados pelo usuário.",
          ],
        },
      ]}
    />
  );
}
