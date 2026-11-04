# Plano de desenvolvimento — Entreguei App para Android

## Objetivo

Recriar o Entreguei App como um aplicativo Android instalável, usando React Native com Expo, TypeScript e SQLite local. O app deve funcionar sem internet e preservar as funcionalidades da versão web.

## Referência existente

- `index.html`: interface, regras de negócio, validações e formato atual dos dados.
- `README.md`: funcionalidades e instruções da versão web.
- A versão web guarda dados no `localStorage`; esses dados não serão transferidos automaticamente para o app. A migração será feita por backup JSON exportado pelo usuário.

Antes de implementar cada funcionalidade, consultar a versão web para manter o comportamento consistente. Não alterar nem remover a versão web como parte da recriação nativa.

## Escopo funcional

1. **Entregas e resumo**
   - Selecionar uma data e navegar pelos dias da semana.
   - Mostrar entregas do dia, quantidade e total recebido.
   - Adicionar entrega escolhendo um bairro cadastrado.
   - Guardar no registro o nome e o valor do bairro no momento da entrega.
   - Excluir uma entrega individualmente ou limpar as entregas da data selecionada.
2. **Bairros**
   - Cadastrar, editar e excluir bairros.
   - Validar nome, valor positivo e nomes duplicados, sem diferenciar maiúsculas/minúsculas.
   - Excluir um bairro não deve apagar nem alterar entregas já registradas.
3. **Diária**
   - Configurar o valor da diária e se ela deve ser somada ao total.
   - Somar a diária no máximo uma vez por dia, inclusive em dias sem entregas, seguindo o comportamento atual.
4. **Backup**
   - Exportar e importar os dados em JSON.
   - Aceitar o formato usado pela versão web, após confirmar a estrutura exata no código.
   - Validar o arquivo importado antes de substituir os dados atuais e informar erros ao usuário.

## Diretrizes técnicas

- Usar Expo, React Native e TypeScript; preferir bibliotecas do ecossistema Expo para navegação, seleção de arquivos e compartilhamento.
- Usar `expo-sqlite` como persistência principal. Não manter `localStorage` ou depender de conexão com a internet.
- Armazenar valores monetários em centavos como inteiros no banco. Converter para reais apenas na interface e na importação/exportação, respeitando o formato legado.
- Persistir datas como chaves locais `YYYY-MM-DD`; não derivar o dia exibido de uma conversão UTC que possa deslocar a data.
- Salvar data e horário da criação da entrega. Usar migrações/versionamento do banco para alterações futuras de esquema.
- Manter interface e mensagens em português do Brasil, adaptadas aos controles nativos e acessíveis.
- Separar responsabilidades entre telas, componentes, regras de negócio e acesso a dados; evitar concentrar a implementação em um único arquivo.
- Tratar falhas de banco, importação e exportação explicitamente; não apresentar sucesso quando a operação falhar.

## Etapas

### 1. Reconhecimento e estrutura

- Conferir o conteúdo completo de `index.html`, especialmente inicialização, persistência e backup.
- Verificar os arquivos e ferramentas disponíveis no repositório antes de escolher comandos.
- Criar/configurar o projeto Expo com TypeScript e confirmar que inicia no Android.
- Definir estrutura de diretórios e navegação simples para Entregas e Bairros.

**Concluído quando:** o projeto inicia no Android e a estrutura mínima compila sem remover os arquivos da versão web.

### 2. Banco de dados e regras

- Definir esquema para bairros, entregas e configurações.
- Incluir identificadores estáveis; entregas guardam cópias do nome do bairro e do valor em centavos.
- Implementar inicialização e migrações do SQLite, além das operações de leitura e gravação.
- Implementar cálculos por data/semana e validações fora da camada visual, quando apropriado.

**Concluído quando:** os dados sobrevivem ao fechamento/reabertura do app e as operações básicas respeitam as regras acima.

### 3. Telas principais

- Criar a tela de entregas com seletor de data, resumo semanal, totais, formulário e lista.
- Criar a tela de bairros com cadastro, edição, exclusão e configuração da diária.
- Conectar as telas ao SQLite e atualizar a interface após cada alteração.
- Implementar estados vazios, carregamento, validação, confirmação de exclusão e mensagens de erro/sucesso.

**Concluído quando:** todos os fluxos do escopo funcionam no dispositivo e os dados permanecem corretos ao navegar entre telas.

### 4. Backup e compatibilidade

- Implementar exportação e importação JSON.
- Conferir o formato legado diretamente em `index.html`; cobrir campos opcionais ou formatos antigos que o app web suporte.
- Validar todo o conteúdo antes de importar e só substituir os dados após validação bem-sucedida.
- Testar exportar no app e importar de volta, além de importar um backup da versão web.

**Concluído quando:** os dados podem ser transferidos por backup sem perda silenciosa nem corrupção do estado atual em caso de arquivo inválido.

### 5. Verificação e entrega

- Executar verificações de TypeScript/lint e os testes disponíveis.
- Testar manualmente em Android: bairros, entregas, exclusões, dias diferentes, semana, diária, persistência após reiniciar e backup.
- Gerar uma build Android de teste e documentar como executar o projeto e instalar/testar a build.
- Atualizar a documentação de uso e limitações da migração.

**Concluído quando:** a build inicia em Android, os fluxos críticos passam e as instruções permitem que outra pessoa reproduza a execução.

## Critérios de aceite

- O app funciona offline e os dados persistem após fechar e abrir novamente.
- Totais e quantidade correspondem apenas à data selecionada; a diária é aplicada conforme a configuração e uma única vez.
- Alterar/excluir um bairro não altera entregas anteriores.
- Datas permanecem no dia local esperado ao selecionar, salvar e consultar.
- Backup inválido ou incompatível produz erro explícito e não substitui os dados existentes.
- O backup JSON da versão web pode ser importado após validar seu formato real.
- Existe uma build Android testável e documentação atualizada.

## Fora do escopo inicial

- Sincronização em nuvem, contas de usuário, múltiplos dispositivos e operação multiusuário.
- Publicação na Play Store.
- Mudanças de produto ou funcionalidades não presentes na versão web.

## Registro de andamento

Atualizar esta seção ao concluir cada etapa, anotando decisões relevantes, testes executados e bloqueios. Não marcar uma etapa como concluída sem verificar seu critério.

- Implementados o projeto Expo/TypeScript com Expo Router, as telas de entregas e bairros, a persistência SQLite e os fluxos de backup JSON compatíveis com o formato da versão web.
- Verificações executadas: `npx expo lint`, `npx tsc --noEmit`, `npx expo-doctor` (20/20) e `npx expo export --platform android`; também foram exercitadas as conversões do backup, centavos e datas locais.
- Configurado o perfil EAS `preview` para gerar APK instalável na nuvem, sem exigir Android SDK local. O build depende de autenticação e vinculação à conta Expo do usuário.
- Pendente: usuário autenticar/vincular o projeto no EAS, gerar e instalar o APK, validar fluxos em aparelho Android e corrigir eventuais problemas encontrados.

- [ ] Reconhecimento e estrutura
- [ ] Banco de dados e regras
- [ ] Telas principais
- [ ] Backup e compatibilidade
- [ ] Verificação e entrega
