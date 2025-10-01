const admin = require("firebase-admin");
const {onCall} = require("firebase-functions/v2/https");

/**
 * @params {object} request - Objeto de requisição contendo dados da loja e da pessoa.
 * @returns {object} - Retorna um objeto com o sucesso ou uma mensagem de erro.
 * cria ou edita pessi e permiçoes na loja
 * Verifica se o usuário autenticado pode criar/editar uma Pessoa.
 * Se for o Unico Proprietarop não pode excluir ele mesmo
 * Adiciona o usuário como proprietário da loja com permissões totais.
 * Retorna o ID da nova loja ou uma mensagem de erro.
 */